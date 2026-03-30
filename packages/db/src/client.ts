import "server-only";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

if (!process.env.POSTGRES_URL) {
  throw new Error("Missing POSTGRES_URL environment variable");
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

const isLocalDb = process.env.POSTGRES_URL.includes("localhost");
const defaultMaxConnections = isLocalDb ? 10 : 3;
const maxConnections =
  parsePositiveInt(process.env.POSTGRES_MAX_CONNECTIONS) ??
  defaultMaxConnections;

const client = postgres(process.env.POSTGRES_URL, {
  // Supabase transaction mode (6543) is not compatible with prepared statements.
  prepare: false,
  // Keep connection usage low in serverless runtimes.
  max: maxConnections,
});

export const db = drizzle({
  client,
  schema,
  casing: "snake_case",
});
export type Db = typeof db;