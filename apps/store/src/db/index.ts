import { neon, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleNeonWs } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

function createDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

// Transaction-capable client (websocket Pool). neon-http is stateless so it cannot
// run BEGIN/COMMIT; atomic sale commits use this.
function createTxDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return drizzleNeonWs(pool, { schema });
}

/**
 * Lazy proxy: the client is only created the first time a query actually runs.
 * This keeps `next build` env-independent — importing an API route that uses
 * `@/db` must not throw when DATABASE_URL is only available at runtime.
 */
function lazy<T extends object>(factory: () => T): T {
  let value: T | null = null;
  return new Proxy({} as T, {
    get(_target, prop: string | symbol) {
      // Never let bundlers treat the proxy as a thenable/promise.
      if (prop === "then") return undefined;
      const v = (value ??= factory());
      const member = (v as Record<string | symbol, unknown>)[prop];
      return typeof member === "function" ? (member as (...args: unknown[]) => unknown).bind(v) : member;
    },
  });
}

export const db: ReturnType<typeof createDb> = lazy(createDb);
export const txDb: ReturnType<typeof createTxDb> = lazy(createTxDb);
