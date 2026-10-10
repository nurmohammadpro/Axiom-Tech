# Axiom Tech - project context (read first, every session)

Axiom Tech = SaaS platform for the "Tech Shop Management System": a **Platform Admin (control plane)** plus the **store app** that each shop uses.
The store app code in `apps/store` was copied once from playstore-storefront (no git history, no data) and is now owned by this repo.

## Hard rules
- NEVER touch the playstore-storefront repo or its database. No pushes, PRs, reads of its DB. It is a separate project; forget it.
- Never import data from it (no backups, CSVs, SQL dumps, seeds with real data).
- Tenancy: one Neon database + role per shop (approved). No `tenant_id` columns, no shared database.
- UI is to be updated and some UX changed; Nur supplies the designs later. Do not redesign unprompted.

## Layout
- `apps/store`    - store-level app (Next.js 16, Drizzle, Neon serverless driver). Will become tenant-aware (db resolved per hostname).
- `apps/platform` - Platform Admin (Next.js 16, Drizzle + postgres-js, own Postgres). Built: tenant registry, plans, 7-day trial lifecycle, BanglaQR payment records, Activate to Production, expiry cron, gate API, roles. Run: `bun run dev` (port 3100), `bun run db:migrate && bun run db:seed`, `bun test` (needs DATABASE_URL to a throwaway Postgres).
- `docs/`         - PLAN.md, store-design-spec.md

## Approved decisions (Nur)
- Plans: Starter, Growth, Pro. Prices in BDT: monthly 1,000/2,000/3,000; sign-up fee 5,000/10,000/15,000. Limits: staff seats 1/2/unlimited, warehouses 1/2/unlimited.
- DB host: Neon (API provisioning). Hosting: Hostinger KVM 2 + Dokploy (Traefik).
- Billing at launch: BanglaQR, manual verification (transaction ID, amount, proof); admin records payment.
- Shops at `shopname.<ROOT_DOMAIN>`; for now ROOT_DOMAIN = `axiom.appbrainer.tech` (admin at `admin.axiom.appbrainer.tech`), wildcard DNS + DNS-01 TLS. Keep it an env var so the later dedicated domain is a config change. Do not use axiompos.app.
- Self-signup and admin-created shops start a 7-day trial.
- Paid sign-up fee + first month fee (physical or BanglaQR) -> admin runs "Activate to Production" (no trial).

## Open
- Feature split confirmation (docs/PRICING.md); dedicated domain purchase later.

## Phase 0 status (done 2026-10-10)
- DONE: fallback secret removed (AUTH_SECRET required in production), AUTH_ALLOW_LEGACY and plaintext-password acceptance removed, debug / migrate-fix-prices / seed-supplier-types routes deleted, db:push/db:seed/db:cleanup scripts removed, Lovable deps and TanStack Start leftovers removed, bun.lock regenerated from the public registry.
- DONE: fresh migrations `apps/store/src/db/migrations` (0000_baseline from schema.ts, 0001_perf_indexes); applied cleanly to an empty Postgres 16 (68 tables, 125 indexes). Old files archived in `src/db/legacy-migrations` (reference only, never run).
- DONE: `tsc --noEmit` clean, `bun run build` green.
- TODO: white-label (~40 "PlayStore" literals), tenant-aware db in store app, store-side gate client, Neon provisioning pipeline, self-signup, Dockerfiles + Dokploy deploy.

## Phase 1 status: platform app (done 2026-10-10)
- DONE: schema + migration (plans, tenants, payments, invoices, tenant_events, platform_users); lifecycle in `src/lib/tenants.ts` (create=7-day trial, activate needs fee+first month, monthly renewal, suspend/resume/extend/cancel/change plan, expiry job with 3-day grace); duplicate transaction IDs rejected; gate `getGate(host)` checks time itself so a missed cron never leaves an expired shop open; roles super_admin/billing/support.
- DONE: admin UI (login with rate limit, dashboard, shops list/search, new shop, shop detail with all actions, plans editor); API `GET /api/gate?host=` (header x-gate-secret), `POST /api/cron/expire` (Bearer CRON_SECRET), `GET /api/health`.
- VERIFIED: 15 integration tests on Postgres 16; tsc clean; production build green; Playwright run of login, create, duplicate slug, underpay rejected, activate, suspend, resume.
- Gate returns `not_ready` until `provision_status = ready` (set by the provisioning pipeline, not built yet).
- Amounts are whole BDT in the platform DB (store app uses its own units).

## Stack
Next.js + TypeScript + Tailwind + shadcn/ui, Drizzle + Postgres, bun. Prefer production-ready, opinionated output.

## Working style (Nur)
No chit-chat. Flag issues concisely, execute after confirmation, never re-ask settled context.
