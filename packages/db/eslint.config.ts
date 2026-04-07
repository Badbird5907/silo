import { defineConfig } from "eslint/config";

import { baseConfig } from "@silo-storage/eslint-config/base";

export default defineConfig(
  {
    ignores: ["dist/**", "seed-analytics.ts", "backfill-storage-snapshots.ts"],
  },
  baseConfig,
);
