# Deploying the platform admin (Dokploy + Neon)

## 1. Control-plane database (Neon)
- Use a dedicated Neon database for the platform only. Never reuse any shop or other project's database.
- Run migrations and seed from any machine that can reach Neon (use the DIRECT, non-pooler URL for migrations):

```bash
cd apps/platform
bun install
DATABASE_URL='postgresql://USER:PASS@HOST/DB?sslmode=require' bun run db:migrate
DATABASE_URL='...' ADMIN_EMAIL='you@appbrainer.tech' ADMIN_PASSWORD='long-unique-password' bun run db:seed
```
`db:seed` upserts the three plans and creates the first super admin only if none with that email exists.

## 2. Dokploy application (platform)
- Source: this repo, build path `.` (repo root), Dockerfile `apps/platform/Dockerfile`, port 3100, domain `admin.axiom.appbrainer.tech`. The image already contains the store migrations (`STORE_MIGRATIONS_DIR` is preset).
- Environment (never commit): `DATABASE_URL` (pooled URL is fine at runtime), `PLATFORM_AUTH_SECRET` (long random), `ROOT_DOMAIN=axiom.appbrainer.tech`, `GATE_SECRET`, `CRON_SECRET`, `SECRETS_KEY` (`openssl rand -base64 32`; losing it makes stored shop DB URLs unreadable, so back it up), `NEON_API_KEY`, `NEON_PROJECT_ID` (from the Neon console: account API keys; the project that will hold shop databases).
- Run migrations/seed from the container once: `docker exec <container> bun run db:migrate` (and `db:seed` with ADMIN_EMAIL/ADMIN_PASSWORD).
- Scheduled job (daily, e.g. 02:00 Asia/Dhaka): `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://admin.axiom.appbrainer.tech/api/cron/expire`

## 2b. Dokploy application (store, one app serving every shop)
- Build path `.`, Dockerfile `apps/store/Dockerfile`, port 3000 (healthcheck `/api/health`). Domain: wildcard `*.axiom.appbrainer.tech` -> this app; platform stays on `admin.axiom.appbrainer.tech`.
- Environment: `TENANCY_MODE=multi`, `PLATFORM_URL` (e.g. `https://admin.axiom.appbrainer.tech`), `GATE_SECRET` (same as platform), `SECRETS_KEY` (same as platform; decrypts each shop's DB URL), `AUTH_SECRET` (long random; per-shop session keys are derived from it, rotating it signs everyone out), optional `GATE_CACHE_TTL_MS` (default 30000), `DB_POOL_MAX` (default 5 per shop). `DATABASE_URL` is not used in multi mode.
- Behavior: unknown shop 404; suspended/expired/cancelled 402; platform unreachable and nothing cached 503. A shop that was allowed keeps running up to 15 min if the platform is down. Block/unblock takes effect within 10-30 s. `/api/health` is liveness only.
- Traefik must pass the original `Host` header (default).

## 3. DNS and TLS
- `A` records for `admin.axiom` and wildcard `*.axiom` to the VPS IP (Cloudflare, DNS only or proxied).
- Wildcard certificate needs a DNS-01 challenge: set a Cloudflare API token in Traefik's certificate resolver.

## 4. Neon notes
- Free plan: 1 GB storage and 100 CU-hours per project, shared by every shop database. Upgrade before onboarding paying shops.
- Do not enable the Neon Data API (PostgREST / neon-js) for any of these databases: the apps connect over normal Postgres and the Data API would add a second, HTTP entry point.
- Use a separate Neon project (or at least a separate database) for the platform and for shops; never the PlayStore project.

## 5. Secrets hygiene
- Credentials pasted into chat or tickets must be rotated (Neon: Roles, reset password).
