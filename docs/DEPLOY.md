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
- Source: this repo, build path `apps/platform`, Nixpacks or Dockerfile, port 3100, domain `admin.axiom.appbrainer.tech`.
- Environment (never commit): `DATABASE_URL` (pooled URL is fine at runtime), `PLATFORM_AUTH_SECRET` (long random), `ROOT_DOMAIN=axiom.appbrainer.tech`, `GATE_SECRET`, `CRON_SECRET`, `SECRETS_KEY` (`openssl rand -base64 32`; losing it makes stored shop DB URLs unreadable, so back it up), `NEON_API_KEY`, `NEON_PROJECT_ID` (from the Neon console: account API keys; the project that will hold shop databases).
- Build must include `apps/store/src/db/migrations` (provisioning reads it); deploy the whole repo, not only `apps/platform`.
- Scheduled job (daily, e.g. 02:00 Asia/Dhaka): `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://admin.axiom.appbrainer.tech/api/cron/expire`

## 3. DNS and TLS
- `A` records for `admin.axiom` and wildcard `*.axiom` to the VPS IP (Cloudflare, DNS only or proxied).
- Wildcard certificate needs a DNS-01 challenge: set a Cloudflare API token in Traefik's certificate resolver.

## 4. Neon notes
- Free plan: 1 GB storage and 100 CU-hours per project, shared by every shop database. Upgrade before onboarding paying shops.
- Do not enable the Neon Data API (PostgREST / neon-js) for any of these databases: the apps connect over normal Postgres and the Data API would add a second, HTTP entry point.
- Use a separate Neon project (or at least a separate database) for the platform and for shops; never the PlayStore project.

## 5. Secrets hygiene
- Credentials pasted into chat or tickets must be rotated (Neon: Roles, reset password).
