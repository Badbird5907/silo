import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    "src/index.ts",
    "src/application.ts",
    "src/audio.ts",
    "src/image.ts",
    "src/misc.ts",
    "src/text.ts",
    "src/video.ts",
  ],
  format: ["esm"],
  sourcemap: true,
  target: "es2022",
});
