import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const client = postgres(url, { max: 1, prepare: false });
await migrate(drizzle(client), { migrationsFolder: new URL("./migrations", import.meta.url).pathname });
await client.end();
console.log("platform migrations applied");
