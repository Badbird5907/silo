import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy, organization } from "better-auth/plugins";

import { db } from "@silo-storage/db/client";

import { authEnv } from "../env";
import { organizationAccessControl, organizationRoles } from "./permissions";
export * from "./permissions";

type SocialProviderConfig = Record<string, unknown> & {
  clientId: string;
  clientSecret: string;
  redirectURI?: string;
  disableImplicitSignUp?: boolean;
};


export function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;
  socialProviders?: Record<string, SocialProviderConfig>;
  extraPlugins?: TExtraPlugins;
  databaseHooks?: BetterAuthOptions["databaseHooks"];
}) {
  const env = authEnv();
  const config = {
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
    }),
    databaseHooks: options.databaseHooks ?? {},
    baseURL: options.baseUrl,
    secret: options.secret,
    plugins: [
      oAuthProxy({
        productionURL: options.productionUrl,
      }),
      organization({
        allowUserToCreateOrganization: () => !env.DISABLE_ORG_CREATION,
        ac: organizationAccessControl,
        roles: organizationRoles,
      }),
      ...(options.extraPlugins ?? []),
    ],
    socialProviders: Object.fromEntries(
      Object.entries(options.socialProviders ?? {}).map(([key, value]) => [
        key,
        {
          ...value,
          clientId: value.clientId,
          clientSecret: value.clientSecret,
          redirectURI:
            value.redirectURI ??
            `${options.productionUrl}/api/auth/callback/${key}`,
          disableImplicitSignUp:
            value.disableImplicitSignUp ?? env.DISABLE_SIGNUP,
        },
      ]),
    ),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !!env.DISABLE_SIGNUP,
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
