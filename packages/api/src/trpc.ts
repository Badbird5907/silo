/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1)
 * 2. You want to create a new middleware or type of procedure (see Part 3)
 *
 * tl;dr - this is where all the tRPC server stuff is created and plugged in.
 * The pieces you will need to use are documented accordingly near the end
 */
import type { Auth, PermissionCheck, Session } from "@silo-storage/auth";
import type { Redis } from "@upstash/redis";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod/v4";

import { roleHasPermissions } from "@silo-storage/auth";
import { and, eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { members, organizations } from "@silo-storage/db/schema";
import { redis } from "@silo-storage/redis";
import { getClientIpFromHeaders } from "@silo-storage/shared";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */

export async function createTRPCContext(opts: {
  headers: Headers;
  auth: Auth;
}): Promise<{
  authApi: Auth["api"];
  session: Session | null;
  db: typeof db;
  redis: Redis;
  clientIp: string | null;
}> {
  const authApi = opts.auth.api;
  const session = await authApi.getSession({
    headers: opts.headers,
  });
  return {
    authApi,
    session,
    db,
    redis,
    clientIp: getClientIpFromHeaders(opts.headers),
  };
}

/**
 * 2. INITIALIZATION
 *
 * This is where the trpc api is initialized, connecting the context and
 * transformer
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError:
        error.cause instanceof ZodError
          ? z.flattenError(error.cause as ZodError<Record<string, unknown>>)
          : null,
    },
  }),
});

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these
 * a lot in the /src/server/api/routers folder
 */

/**
 * This is how you create new routers and subrouters in your tRPC API
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an articifial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev 100-500ms
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthed) procedure
 *
 * This is the base piece you use to build new queries and mutations on your
 * tRPC API. It does not guarantee that a user querying is authorized, but you
 * can still access user session data if they are logged in
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

/**
 * Organization-scoped procedure
 *
 * Use this for routes that require an organizationId. It validates that:
 * 1. The user is authenticated
 * 2. The organization exists
 * 3. The user is a member of the organization
 *
 * The organizationId and membership are added to the context.
 */
export const organizationProcedure = protectedProcedure
  .input(z.object({ organizationId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    // Get the organization
    const organization = await ctx.db.query.organizations.findFirst({
      where: eq(organizations.id, input.organizationId),
    });

    if (!organization) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found",
      });
    }

    // Check if user is a member
    const membership = await ctx.db.query.members.findFirst({
      where: and(
        eq(members.organizationId, input.organizationId),
        eq(members.userId, ctx.session.user.id),
      ),
    });

    if (!membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are not a member of this organization",
      });
    }

    return next({
      ctx: {
        ...ctx,
        organizationId: input.organizationId,
        organization,
        membership,
      },
    });
  });

export function requirePermission(
  permissions: PermissionCheck,
  message?: string,
) {
  return t.middleware(({ ctx, next }) => {
    const membership = (ctx as typeof ctx & { membership?: { role: string } })
      .membership;

    if (!membership) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Permission checks require organization-scoped procedures",
      });
    }

    if (!roleHasPermissions(membership.role, permissions)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: message ?? "You don't have permission to perform this action",
      });
    }

    return next();
  });
}
