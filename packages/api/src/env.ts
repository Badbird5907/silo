import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
   */
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    WORKER_URL: z.url(),
    PROJECT_ROUTE_MODE: z.enum(["subdomain", "path"]).default("subdomain"),
    CALLBACK_SECRET: z.string().min(32),
  },
  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {},
  /**
   * Specify your shared environment variables schema here.
   */
  shared: {},
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    WORKER_URL: process.env.WORKER_URL,
    PROJECT_ROUTE_MODE: process.env.PROJECT_ROUTE_MODE,
    CALLBACK_SECRET: process.env.CALLBACK_SECRET,
  },
  clientPrefix: "NEXT_PUBLIC_",
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
