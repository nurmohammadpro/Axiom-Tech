import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectionUrl } from "./url";

const client = postgres(connectionUrl(), { max: 1, prepare: false });
await migrate(drizzle(client), { migrationsFolder: new URL("./migrations", import.meta.url).pathname });
await client.end();
console.log("platform migrations applied");
