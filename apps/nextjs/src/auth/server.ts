import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { nextCookies } from "better-auth/next-js";

import { initAuth } from "@silo-storage/auth";

import { env } from "@/env";
import { nanoid } from "nanoid";
import { db } from "@silo-storage/db/client";
import { eq } from "@silo-storage/db";
import { members,users } from "@silo-storage/db/schema";
import { dash } from "@better-auth/infra";
import type { BetterAuthPlugin } from "better-auth";

const baseUrl =
  env.VERCEL_ENV === "production"
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : env.VERCEL_ENV === "preview"
      ? `https://${env.VERCEL_URL}`
      : "http://localhost:3000";

const productionUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
const dashPlugin = (dash as unknown as () => BetterAuthPlugin)();
export const auth = initAuth({
  baseUrl,
  productionUrl,
  secret: env.AUTH_SECRET,
  socialProviders: {
    github: {
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
    }
  },
  extraPlugins: [nextCookies(), dashPlugin],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await createDefaultOrganization(user)
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          return await setActiveOrganization(session)
        },
      },
    },
  },
});


async function createDefaultOrganization(
  user: typeof auth.$Infer.Session.user
) {
  try {
    const randomString = nanoid().slice(0, 8)
    await auth.api.createOrganization({
      body: {
        userId: user.id,
        name: `${user.name}'s Organization`,
        slug: `${user.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toLowerCase()}-org-${randomString}`,
      },
    })
  } catch (err) {
    await db.delete(users).where(eq(users.id, user.id))
    throw err
  }
}

async function setActiveOrganization(session: { userId: string }) {
  const firstOrg = await db.select().from(members).where(eq(members.userId, session.userId)).limit(1)

  return {
    data: {
      ...session,
      activeOrganizationId: firstOrg[0]?.organizationId,
    },
  }
}

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
