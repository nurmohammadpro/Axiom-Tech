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
- `apps/platform` - Platform Admin (to build): registry, plans, billing, trials, provisioning, support.
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
- TODO: white-label (~40 "PlayStore" literals), tenant-aware db, subscription gate, platform app.

## Stack
Next.js + TypeScript + Tailwind + shadcn/ui, Drizzle + Postgres, bun. Prefer production-ready, opinionated output.

## Working style (Nur)
No chit-chat. Flag issues concisely, execute after confirmation, never re-ask settled context.
