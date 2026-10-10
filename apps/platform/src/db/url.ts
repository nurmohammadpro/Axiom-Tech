/**
 * Normalises DATABASE_URL for postgres-js. Neon's copy-paste URL can carry
 * `channel_binding=require`, which postgres-js forwards to the server as a startup
 * parameter and Postgres rejects; it is dropped here (TLS via sslmode is kept).
 */
export function connectionUrl(raw: string | undefined = process.env.DATABASE_URL): string {
  if (!raw) throw new Error("DATABASE_URL is required");
  const u = new URL(raw);
  u.searchParams.delete("channel_binding");
  return u.toString();
}
