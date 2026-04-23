import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    "src/index.ts",
    "src/adapterData.ts",
    "src/audit.ts",
    "src/events.ts",
    "src/network.ts",
    "src/signing.ts",
    "src/slug.ts",
  ],
  format: ["esm"],
  sourcemap: true,
  target: "es2022",
});
