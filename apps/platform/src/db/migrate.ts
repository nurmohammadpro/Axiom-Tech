import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectionUrl } from "./url";

const client = postgres(connectionUrl(), { max: 1, prepare: false });
await migrate(drizzle(client), {
  migrationsFolder: new URL("./migrations", import.meta.url).pathname,
  // Shared Neon database: the store app's drizzle journal lives in the default
  // migrations table, so the platform keeps its own.
  migrationsTable: "__platform_migrations",
});
await client.end();
console.log("platform migrations applied");
