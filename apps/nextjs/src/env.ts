import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod/v4";

import { authEnv } from "@silo-storage/auth/env";

const booleanEnvironmentValue = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

export const env = createEnv({
  extends: [authEnv()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    DISABLE_ORG_CREATION: z.boolean().default(false),
    SILO_CDN: z.url().min(1),
  },
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
   */
  server: {
    POSTGRES_URL: z.url().optional(),
    POSTGRES_URL_DIRECT: z.url().optional(),
    APP_URL: z.url(),
    WORKER_URL: z.url(),
    WORKER_DOMAIN: z.string().min(1), // e.g., "files.evanyu.dev" (without protocol)
    PROJECT_ROUTE_MODE: z.enum(["subdomain", "path"]).default("subdomain"),
    SIGNING_SECRET: z.string().min(32),
    CALLBACK_SECRET: z.string().min(32),
    WEBHOOK_DELIVERY_ENABLED: booleanEnvironmentValue.default(true),
    UPLOADS_ENABLED: booleanEnvironmentValue.default(true),
    DEV_UPLOAD_SSE_ENABLED: booleanEnvironmentValue.default(true),
    BETTER_AUTH_API_KEY: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   */
  experimental__runtimeEnv: {
    ...process.env,
    DISABLE_ORG_CREATION:
      process.env.NEXT_PUBLIC_DISABLE_ORG_CREATION === "true",
    SILO_CDN: process.env.NEXT_PUBLIC_SILO_CDN,
  },
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
