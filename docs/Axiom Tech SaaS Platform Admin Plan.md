# Axiom Tech SaaS Platform Admin Plan

Oct 10, 2026 · @Nur Mohammad

Axiom Tech is one new monorepo holding the platform admin and a tenant-aware copy of the store app, with one Neon database per shop; playstore-storefront and its database are never touched.

## Findings

The store app is a complete single-tenant system with no tenant boundary anywhere, so SaaS has to be added around it, not inside it.

| Area | What the repo shows | SaaS impact |
| --- | --- | --- |
| Stack | Next.js 16 + React 19, Drizzle ORM, Neon Postgres, bun, Docker, Cloudinary | Neon API can provision databases programmatically |
| Size | 63 tables, 106 API routes, 50 pages, 108 files import `@/db` (138 query calls) | Row-level tenancy would touch almost all of it |
| Tenancy | No tenant column. `locations` are warehouses inside one shop. One unused `store_id` text on `sales` | Nothing to build on; do not overload `locations` |
| Global uniques | `sku`, `imei1`, `serial`, `barcode`, `invoice_number`, `sale_number`, `batch_number`, `users.email`, supplier and customer `phone` | Two shops would collide in a shared DB |
| Config | `store_settings` is a key/value table, one logical store | Becomes per-tenant for free with DB-per-tenant |
| Auth | Custom HMAC session `v1.userId.exp.sig`, scrypt hashes, roles owner/manager/salesman/customer, edge gate in `proxy.ts` | Secret falls back to a hard-coded dev string |
| Feature gating | `feature_settings` (feature x role) with `requireFeature()` | Reusable as the plan-entitlement hook |
| Migrations | Drizzle, `src/db/migrations` 0000 to 0018, plus `db:push` in scripts | A fleet needs strictly ordered migrations, never `push` |
| Branding | "PlayStore" referenced in 33 files | White-label per tenant needed |
| Deploy | Single Dockerfile, `server.ts` Next handler | Container-per-tenant is possible on day one |

## Tenancy decision

Approved: one Neon database per shop. Since the store code is copied into the Axiom Tech repo and owned there, it can be edited, so the shared runtime (option B) is back and is the default; option C stays available for large clients.

| Option | Store-app changes | Isolation | Cost per shop | Verdict |
| --- | --- | --- | --- | --- |
| A. Shared DB + `tenant_id` | All 63 tables, 138 queries, every unique index | Weakest | Lowest | Rejected |
| B. DB-per-tenant, shared app runtime | Tenant-aware `db`, auth secret, settings, hostname resolution | Strong | Low | Default |
| C. DB + container per tenant | None | Strongest | Highest (about 300 to 600 MB RAM per shop, estimate) | Optional for big clients |

Capacity: one shared runtime on a Hostinger KVM 2 can serve far more shops than containers per shop, because memory is paid once. Verify with a load test in Phase 1.

Database: Neon, confirmed. The platform provisions one database and role per shop through the Neon API. Repo layout: `apps/store` and `apps/platform` (Next.js, TypeScript, Tailwind, shadcn/ui), with the platform's own Postgres.

## Platform Admin scope

The control plane owns the shop lifecycle, money and fleet health; the store app keeps everything operational.

| Module | What it does |
| --- | --- |
| Tenant registry | Shop record: name, slug, subdomain, owner contact, status (trial, active, suspended, cancelled), trial end date, Dokploy app ID, Neon database ID |
| Lifecycle | Self-signup or admin-created shop starts a 7-day trial. If the sign-up fee and first month fee are paid (physically or by BanglaQR), admin runs Activate to Production: no trial, full access |
| Provisioning | Neon database and role, migrations, seeds, owner account, Dokploy app, env vars, subdomain and TLS |
| Plans | Starter, Growth, Pro: price, sign-up fee, feature flags written to the shop's `feature_settings`, advisory limits |
| Billing (BanglaQR) | Invoice with BanglaQR code, admin records payment (transaction ID, amount, proof image), receipt, next due date, monthly invoice generation, overdue list |
| Gate | Traefik forwardAuth endpoint; trial expired or suspended shops see a branded block page |
| Releases | Pinned store-app version per shop, rollout with migrations, canary, per-shop status |
| Support | Audited impersonation, shop health (last sale, errors), password reset, export |
| Analytics | Active shops, trials, conversion, revenue, churn, usage per shop |
| Platform users | Super admin, billing, support roles with audit log |
| Backups | Scheduled per-shop dump, restore, offboarding export |

## Store-app changes (in the Axiom Tech repo)

The store code was imported once into `apps/store` without history or data, then edited freely.

1. **Tenant-aware DB:** resolve the connection string per request from the hostname (AsyncLocalStorage around `db` and `txDb`), cached per shop.
2. **Per-shop secret and settings:** remove the hard-coded fallback session secret; one secret per shop.
3. **Subscription gate:** `proxy.ts` asks the platform for tenant status (cached); trial expired or suspended shows a block page; past due can be read-only.
4. **Entitlements:** plan feature flags through the existing `feature_settings` and `requireFeature()`, plus hard limits on staff, warehouses and products.
5. **Hardening:** delete `app/api/debug/*`, `migrate-fix-prices`, `seed-supplier-types`; remove the `AUTH_ALLOW_LEGACY` path.
6. **Migrations:** create one fresh baseline migration from `schema.ts` (the imported journal lists only 3 of 19 migrations), then ordered migrations only.
7. **White-label:** replace "PlayStore" literals (about 40 files) with shop settings.
8. **UI and UX:** updates arrive from Nur later and slot in as supplied.
9. **Internal API:** signed routes for health, usage counters, owner bootstrap and impersonation.

Domain recommendation: do not use axiompos.app, which is the separate AxiomPOS retail product. Use a dedicated product domain (for example axiomtech.app) with shops at `*.axiomtech.app` and the platform at `admin.axiomtech.app`, branded "by AppBrainer"; appbrainer.tech stays the corporate parent. Without a new domain, use `*.axiom.appbrainer.tech`. Wildcard TLS needs a Cloudflare DNS token in Traefik.

## Roadmap

First paying shop on the platform at the end of Phase 2, roughly 7 weeks from start (estimate, one developer plus Claude).

| Phase | Weeks | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| 0. Import and hardening | 1 | Store code in `apps/store` (done locally), secret and legacy-auth fixes, debug routes removed, fresh baseline migration, white-label settings | Build is green; an empty Neon database reaches a working shop from the baseline migration |
| 1. Platform foundation and provisioning | 3 | `apps/platform`, platform auth and roles, tenant registry, plans, Neon API client, tenant-aware store runtime, admin-created trial shop | Admin creates a 7-day trial shop live on its subdomain in under 5 minutes |
| 2. BanglaQR billing and gate | 2 | Sign-up fee and monthly invoices, payment recording (transaction ID, amount, proof), Activate to Production, subscription gate, trial expiry job, suspend and resume | An unpaid shop is blocked after day 7 automatically; recording payment and activating restores access with no trial |
| 3. Self-signup | 1 to 2 | Public signup, verification, 7-day trial start, onboarding checklist, trial reminders | A stranger signs up and reaches a working shop without admin help |
| 4. Fleet operations | 2 | Release and migration runner with canary, health, usage, per-shop backups and restore, audited impersonation, export | One release rolls to all shops with per-shop status; a shop is restored from backup |
| 5. Growth and UI/UX | ongoing | Updated UI and UX from Nur, analytics, broadcasts, custom domains, referral, Bangla admin UI | Trial to paid conversion visible in the dashboard |

## Pre-flight fixes and risks

These weaknesses came with the imported code and are fixed in the Axiom Tech repo in Phase 0.

| Issue in imported code | Fix |
| --- | --- |
| Hard-coded fallback session secret | Per-shop secret; app refuses to start without it |
| Debug and one-off routes | Deleted |
| `AUTH_ALLOW_LEGACY` bare `x-user-id` header | Code path removed |
| Drizzle journal lists 3 of 19 migrations; `db:push` used | One fresh baseline from `schema.ts`, then ordered migrations only; `db:push` removed |
| Destructive `seed.ts` and one-off scripts | Not imported |
| Backup, SQL, CSV data files | Not imported; no data ever crosses over |

Main risks: migration drift across shop databases (canary plus per-shop version table), VPS memory ceiling of about 8 to 10 shops per KVM 2, Neon limits at fleet scale, and the Neon-only database driver tying hosting to Neon.

Security note: the GitHub token shared in chat was used only to clone, is not stored in the repo config, and should be revoked and replaced with a fine-grained read-only token.

## Decisions

- [x] Database per tenant on Neon (approved)
- [x] New repo Axiom Tech (created); playstore-storefront and its database never touched; PlayStore is a separate project (approved)
- [x] Plan names Starter, Growth, Pro; prices in BDT (approved)
- [x] Billing at launch: BanglaQR with manual verification (approved)
- [x] Hosting: Hostinger KVM 2 with Dokploy (approved)
- [x] Subdomain per shop (approved)
- [x] 7-day trial for self-signup and admin-created shops; admin activates paid shops directly (approved)
- [x] Root domain: new dedicated domain (recommended) or `*.axiom.appbrainer.tech`; not axiompos.app
- [x] BDT price points: sign-up fee and monthly price per plan
- [x] Allow the Claude GitHub App on the Axiom Tech repo so pushes work
