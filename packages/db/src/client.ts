import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

interface DatabaseRuntimeState {
  url?: string;
  clients: Map<string, ReturnType<typeof createDatabase>>;
}

const runtimeKey = Symbol.for("silo.database.runtime");

function getRuntimeState(): DatabaseRuntimeState {
  const root = globalThis as typeof globalThis & {
    [runtimeKey]?: DatabaseRuntimeState;
  };
  return (root[runtimeKey] ??= { clients: new Map() });
}

function createDatabase(url: string) {
  const isLocalDb = url.includes("localhost") || url.includes("127.0.0.1");
  const defaultMaxConnections = isLocalDb ? 10 : 3;
  const maxConnections =
    parsePositiveInt(process.env.POSTGRES_MAX_CONNECTIONS) ??
    defaultMaxConnections;
  const client = postgres(url, {
    // Supabase transaction mode (6543) is not compatible with prepared statements.
    prepare: false,
    max: maxConnections,
  });

  return drizzle({
    client,
    schema,
    casing: "snake_case",
  });
}

function resolveDatabase() {
  const state = getRuntimeState();
  const url = state.url ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "Missing database connection. Configure Hyperdrive or POSTGRES_URL.",
    );
  }

  const existing = state.clients.get(url);
  if (existing) return existing;

  const created = createDatabase(url);
  state.clients.set(url, created);
  return created;
}

export function configureDatabaseRuntime(url: string): void {
  getRuntimeState().url = url;
}

export type Db = ReturnType<typeof createDatabase>;

export const db = new Proxy({} as Db, {
  get(_target, property) {
    return Reflect.get(resolveDatabase(), property) as unknown;
  },
});
