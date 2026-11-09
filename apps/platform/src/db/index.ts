import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { connectionUrl } from "./url";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const g = globalThis as unknown as { __axiomDb?: Db };

function create(): Db {
  const url = connectionUrl();
  // prepare:false keeps this compatible with pooled (pgbouncer) endpoints such as Neon's.
  return drizzle(postgres(url, { max: 10, prepare: false }), { schema });
}

/** Lazy so `next build` does not need runtime env. */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const d = (g.__axiomDb ??= create());
    const v = (d as unknown as Record<string | symbol, unknown>)[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(d) : v;
  },
});
