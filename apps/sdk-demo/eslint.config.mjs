import { defineConfig } from "eslint/config";

import { baseConfig, restrictEnvAccess } from "@silo-storage/eslint-config/base";
import { nextjsConfig } from "@silo-storage/eslint-config/nextjs";
import { reactConfig } from "@silo-storage/eslint-config/react";

export default defineConfig(
  {
    ignores: [".next/**"],
  },
  baseConfig,
  reactConfig,
  nextjsConfig,
  restrictEnvAccess,
);
