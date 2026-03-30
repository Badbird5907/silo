import type { Config } from "drizzle-kit";

if (!process.env.POSTGRES_URL) {
  throw new Error("Missing POSTGRES_URL");
}

const directUrl = process.env.POSTGRES_URL_DIRECT;
const nonPoolingUrl = directUrl ?? process.env.POSTGRES_URL.replace(":6543", ":5432");

export default {
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: { url: nonPoolingUrl },
  casing: "snake_case",
} satisfies Config;
