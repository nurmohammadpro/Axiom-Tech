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
- Plans: Starter, Growth, Pro. Prices in BDT.
- DB host: Neon (API provisioning). Hosting: Hostinger KVM 2 + Dokploy (Traefik).
- Billing at launch: BanglaQR, manual verification (transaction ID, amount, proof); admin records payment.
- Shops at `shopname.<ROOT_DOMAIN>`; for now ROOT_DOMAIN = `axiom.appbrainer.tech` (admin at `admin.axiom.appbrainer.tech`), wildcard DNS + DNS-01 TLS. Keep it an env var so the later dedicated domain is a config change. Do not use axiompos.app.
- Self-signup and admin-created shops start a 7-day trial.
- Paid sign-up fee + first month fee (physical or BanglaQR) -> admin runs "Activate to Production" (no trial).

## Open
- Plan feature split + limits (docs/PRICING.md draft); dedicated domain purchase later.

## Known issues inherited in apps/store (fix in this repo)
- Hard-coded fallback session secret in `src/lib/auth.ts` and `proxy.ts`
- `app/api/debug/*`, `app/api/admin/migrate-fix-prices`, `app/api/seed-supplier-types` routes
- `AUTH_ALLOW_LEGACY` bare `x-user-id` path in `src/lib/authz.ts`
- Drizzle journal lists only 3 of 19 migration files; `db:push` was used. Create a fresh baseline migration from `schema.ts` before provisioning.
- "PlayStore" literals in ~40 files (white-label)

## Stack
Next.js + TypeScript + Tailwind + shadcn/ui, Drizzle + Postgres, bun. Prefer production-ready, opinionated output.

## Working style (Nur)
No chit-chat. Flag issues concisely, execute after confirmation, never re-ask settled context.
