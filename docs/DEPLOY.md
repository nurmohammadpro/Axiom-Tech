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
- Environment (never commit): `DATABASE_URL` (pooled URL is fine at runtime), `PLATFORM_AUTH_SECRET` (long random), `ROOT_DOMAIN=axiom.appbrainer.tech`, `GATE_SECRET`, `CRON_SECRET`.
- Scheduled job (daily, e.g. 02:00 Asia/Dhaka): `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://admin.axiom.appbrainer.tech/api/cron/expire`

## 3. DNS and TLS
- `A` records for `admin.axiom` and wildcard `*.axiom` to the VPS IP (Cloudflare, DNS only or proxied).
- Wildcard certificate needs a DNS-01 challenge: set a Cloudflare API token in Traefik's certificate resolver.

## 4. Secrets hygiene
- Credentials pasted into chat or tickets must be rotated (Neon: Roles, reset password).
