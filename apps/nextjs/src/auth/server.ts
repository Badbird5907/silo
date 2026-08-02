import "server-only";

import type { BetterAuthPlugin } from "better-auth";
import { cache } from "react";
import { headers } from "next/headers";
import { dash } from "@better-auth/infra";
import { nextCookies } from "better-auth/next-js";
import { nanoid } from "nanoid";

import { initAuth } from "@silo-storage/auth";
import { eq } from "@silo-storage/db";
import { db } from "@silo-storage/db/client";
import { members, users } from "@silo-storage/db/schema";

import { env } from "@/env";

const baseUrl = env.APP_URL;
const productionUrl = env.APP_URL;
const enableInfra = !!env.BETTER_AUTH_API_KEY;
const dashPlugin = enableInfra
  ? (dash as unknown as () => BetterAuthPlugin)()
  : undefined;
export const auth = initAuth({
  baseUrl,
  productionUrl,
  secret: env.AUTH_SECRET,
  socialProviders: {
    github: {
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  extraPlugins: [nextCookies(), ...(enableInfra ? [dashPlugin!] : [])],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await createDefaultOrganization(user);
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          return await setActiveOrganization(session);
        },
      },
    },
  },
});

async function createDefaultOrganization(
  user: typeof auth.$Infer.Session.user,
) {
  try {
    const randomString = nanoid().slice(0, 8);
    await auth.api.createOrganization({
      body: {
        userId: user.id,
        name: `${user.name}'s Organization`,
        slug: `${user.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toLowerCase()}-org-${randomString}`,
      },
    });
  } catch (err) {
    await db.delete(users).where(eq(users.id, user.id));
    throw err;
  }
}

async function setActiveOrganization(session: { userId: string }) {
  const firstOrg = await db
    .select()
    .from(members)
    .where(eq(members.userId, session.userId))
    .limit(1);

  return {
    data: {
      ...session,
      activeOrganizationId: firstOrg[0]?.organizationId,
    },
  };
}

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
