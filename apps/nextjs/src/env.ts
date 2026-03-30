import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

import { authEnv } from "@silo-storage/auth/env";

export const env = createEnv({
  extends: [authEnv(), vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    DISABLE_ORG_CREATION: z.boolean().default(false),
  },
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
  */
 server: {
    POSTGRES_URL: z.url(),
    POSTGRES_URL_DIRECT: z.url().optional(),
    WORKER_URL: z.url(),
    WORKER_DOMAIN: z.string().min(1), // e.g., "files.evanyu.dev" (without protocol)
    PROJECT_ROUTE_MODE: z.enum(["subdomain", "path"]).default("subdomain"),
    SIGNING_SECRET: z.string().min(32),
    CALLBACK_SECRET: z.string().min(32),
    WEBHOOK_DELIVERY_ENABLED: z.boolean().default(true),
    DEV_UPLOAD_SSE_ENABLED: z.boolean().default(true),
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
    DISABLE_ORG_CREATION: process.env.NEXT_PUBLIC_DISABLE_ORG_CREATION === "true",
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
