import { defineConfig } from "eslint/config";

import { baseConfig } from "@silo-storage/eslint-config/base";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
);
