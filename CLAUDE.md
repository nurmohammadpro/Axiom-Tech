# Axiom Tech - project context (read first, every session)

Axiom Tech = SaaS platform for the "Tech Shop Management System": a **Platform Admin (control plane)** plus the **store app** that each shop uses.
The store app code in `apps/store` was copied once from playstore-storefront (no git history, no data) and is now owned by this repo.

## Hard rules
- NEVER touch the playstore-storefront repo or its database. No pushes, PRs, reads of its DB. It is a separate project; forget it.
- Never import data from it (no backups, CSVs, SQL dumps, seeds with real data).
- Tenancy: one Neon database + role per shop (approved). No `tenant_id` columns, no shared database.
- UI is to be updated and some UX changed; Nur supplies the designs later. Do not redesign unprompted.

## Layout
- `apps/store`    - store-level app (Next.js 16, Drizzle on `pg`). Tenant-aware: db + access resolved per request host (see Tenancy runtime). `bun test` (set TEST_PG_ADMIN_URL for the routing tests).
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
- DONE (2026-10-13) white-label: all PlayStore names, phone/bKash/Nagad numbers, address, emails, logo and watermark removed from store code and public/; receipts use only the shop's own store_info (logo watermark = shop logo); fallback name "Your Shop"; brand "Axiom Tech" with PLACEHOLDER mark `public/axiom-mark.svg` (replace with real logo); migration 0002 (staff.store_location default "Main Store"); dashboard upgrade banner for `?upgrade=`.
- DONE: Dockerfiles `apps/platform/Dockerfile` and `apps/store/Dockerfile` (context = repo root, root `.dockerignore`); docs/DEPLOY.md updated. Images NOT built here (no docker daemon); `bun run build` and production `server.ts` start verified (health 200, protected 401).
- DONE (2026-10-13) owner session revocation: `tenants.sessions_valid_after` (set by owner reset), returned by the gate, enforced in store proxy via `x-axiom-valid-after` (token issue time = exp - 7d); takes effect within the gate cache TTL (~30 s); revokes ALL users of that shop.
- REMOVED (2026-10-31, Nur): public self-signup is gone. Shops exist only when an admin creates them (`/tenants/new` -> provision -> one-time password). Root `/` renders the admin sign-in; `/signup` bookmarks fall through to `/login`. normalizePhone moved to `lib/domain`. Marketing landing page also removed — the platform has no public marketing surface.

## Phase 1 status: platform app (done 2026-10-10)
- DONE: schema + migration (plans, tenants, payments, invoices, tenant_events, platform_users); lifecycle in `src/lib/tenants.ts` (create=7-day trial, activate needs fee+first month, monthly renewal, suspend/resume/extend/cancel/change plan, expiry job with 3-day grace); duplicate transaction IDs rejected; gate `getGate(host)` checks time itself so a missed cron never leaves an expired shop open; roles super_admin/billing/support.
- DONE: admin UI (login with rate limit, dashboard, shops list/search, new shop, shop detail with all actions, plans editor); API `GET /api/gate?host=` (header x-gate-secret), `POST /api/cron/expire` (Bearer CRON_SECRET), `GET /api/health`.
- VERIFIED: 15 integration tests on Postgres 16; tsc clean; production build green; Playwright run of login, create, duplicate slug, underpay rejected, activate, suspend, resume.
- Gate returns `not_ready` until `provision_status = ready` (set by the provisioning pipeline below).
- Amounts are whole BDT in the platform DB (store app uses its own units).

## Provisioning (done 2026-10-11, `apps/platform/src/lib/provision.ts`)
- Admin clicks "Set up shop" on a shop: claim (atomic, stale after 10 min) -> Neon API creates role + database `shop_<slug>` (`neon.ts`) -> store migrations from `apps/store/src/db/migrations` applied over the direct host -> idempotent seed (owner, store_info, MAIN location, 5 supplier types, 11 categories with parents, 26 expense categories) -> status ready. Shop DB URL stored AES-256-GCM encrypted (`SECRETS_KEY`). Failure keeps the DB and retry resumes (never recreates); errors are scrubbed of URLs/tokens.
- Owner temp password (14 chars) is shown ONCE in the admin UI and never stored. Owner password reset exists (`lib/owner.ts`, permission `tenant:reset_owner`, confirm checkbox, event logged); existing sessions stay valid until expiry (TODO: revocation).
- Env: `SECRETS_KEY`, `NEON_API_KEY`, `NEON_PROJECT_ID` (+ optional `NEON_BRANCH_ID`, `NEON_API_BASE_URL` for tests, `STORE_MIGRATIONS_DIR`).
- VERIFIED: 35 tests (real Postgres stand-in for Neon + mocked Neon HTTP) and a Playwright run against a mock Neon API (create shop -> set up -> credentials shown -> password verifies against the shop DB -> gate allows). That run caught a bug (credentials panel unmounted after success); fixed.
- VERIFIED against live Neon (2026-10-31, project jolly-smoke-31189972 with a project-scoped key): created role + database via the API, applied store migrations + seed on Neon, pooled URL stored encrypted; a mid-run SECRETS_KEY failure left the role+db behind and the retry adopted them via password-reset (crash-resumability proven for real). Owner password reset wrote over the direct Neon URL. Full multi-mode loop locally: store in TENANCY_MODE=multi signed the owner in through the real gate onto the live Neon shop DB; unknown host 404, tampered session rejected, session from another shop rejected. Cancel dropped the shop role+database from Neon, scrubbed credentials, and the gate reports cancelled. Remaining Neon caveat: live Traefik host passthrough (needs the real domain).
- Neon Free plan: 1 GB storage and 100 CU-hours per project, shared by all shop databases. Move to a paid plan before real customers. Neon Data API / neon-js are not used and should stay disabled.

## Tenancy runtime in store (done 2026-10-12)
- `TENANCY_MODE=single` (default; DATABASE_URL, dev/tests) or `multi` (one shared runtime, each request host = a shop).
- `proxy.ts`: multi mode asks the platform gate (`src/lib/tenancy/gate-client.ts`: cache 30 s allowed / 10 s negative, coalesced, stale-if-error up to 15 min for allowed shops only, else 503). 404 unknown, 402 blocked. Forwards verified shop id as `x-axiom-tenant` (client value is stripped); matcher covers everything except static assets and /api/health.
- `src/db/index.ts`: drizzle on `pg`; `TenantPool` resolves the shop's pool per query from `await headers()` host (LRU of 20 pools). `db` and `txDb` are the same object. Gate returns `dbUrlEncrypted` only for allowed shops; store decrypts with `SECRETS_KEY`.
- Sessions: key = HMAC(AUTH_SECRET, `axiom-session-v1:<tenantId>`); `createSessionToken(userId, tenantId)`, `verifySessionToken(token, tenantId)`; a token never verifies on another shop. Production cookie is `secure`.
- Raw `db.execute` returns timestamps as strings with `pg`; orders API normalizes to ISO. Client-imported modules must not import `@/db` (expense DB helpers live in `expense-numbers.ts`).
- Env for store: TENANCY_MODE, PLATFORM_URL, GATE_SECRET, SECRETS_KEY, AUTH_SECRET, optional GATE_CACHE_TTL_MS, DB_POOL_MAX (docs/DEPLOY.md 2b).
- VERIFIED: 13 store tests + 41 platform tests; tsc/build green; e2e (platform + store + mock Neon on local Postgres): provision 2 shops, owner reset in browser, signin per shop, cross-shop token/credential rejected, spoofed header rejected, suspend -> 402 within TTL while other shop unaffected, resume, platform down -> cached shop keeps working, unseen host 503.
- NOT VERIFIED: live Neon pooled URL with `pg`; live Traefik Host passthrough.

## Plan entitlements in store (done 2026-10-13)
- Gate features/limits drive enforcement (`src/lib/tenancy/entitlements.ts`). `proxy.ts` blocks plan-excluded areas centrally: API 403 `{code:"plan_feature"}`, pages redirect to `/dashboard?upgrade=<feature>`. Only higher-plan areas are mapped (audit, campaigns, cash, exchanges, expenses, hr, purchases/procurement, returns, suppliers, analytics, transfers); core flows (POS, inventory, products, customers, barcodes, orders, settings, stock receiving, locations, staff) are never gated by path.
- `getFeatureVisibility`/`canAccessFeature`/`requireFeature`: plan is a ceiling over role toggles, owners included (customer-portal features exempt).
- Limits (`src/lib/plan-limits.ts`): active staff seats (owner row not counted) and active warehouses; checked on create and on reactivation; 403 `{code:"plan_limit"}`. Single mode = unlimited.
- Trial uses the chosen plan's features (no all-Pro trial yet). OPEN: confirm feature split, owner counts as seat?, trial level; UI should show an upgrade prompt for `?upgrade=` and `plan_*` errors.
- VERIFIED: 17 store tests (path map, limits against a real shop DB), tsc, build.

## Stack
Next.js + TypeScript + Tailwind + shadcn/ui, Drizzle + Postgres, bun. Prefer production-ready, opinionated output.

## Working style (Nur)
No chit-chat. Flag issues concisely, execute after confirmation, never re-ask settled context.

## Per-shop feature toggles (2026-10-31)
- `tenants.feature_overrides` jsonb (migration 0004): `true` grants, `false` revokes, absent = inherit from plan. The gate merges them (`effectiveFeatures`), so the store needs no changes and picks up toggles within the gate TTL (~30 s).
- Admin UI: "Feature access" panel on the tenant page (Inherit/On/Off per catalog feature), permission `tenant:features` (super_admin, billing), `setFeatureOverrides` writes a `features_changed` event, refuses cancelled shops, drops unknown keys.
- DYNAMIC TOGGLING SMOKE-VERIFIED end-to-end (2026-10-31): store in TENANCY_MODE=multi behind the real gate; owner of a Growth-plan shop requested /dashboard/expenses (blocked 307 to upgrade page) and /dashboard/cash (200). Granting expenses per-shop flipped the page to 200 within the ~30 s gate TTL; clearing the override re-blocked it; removing cash from the Growth plan re-blocked cash the same way, and re-adding restored it. No redeploy at any point.
- Plan feature lists are editable too: the Plans page toggles any catalog feature per plan (`updatePlanAction`, sanitizeFeatures, non-empty required). Layering = plan features + per-shop overrides. The seed is insert-if-missing since 97f85a5: the Plans editor is the source of truth after first deploy; re-running db:seed never reverts admin edits.

## Direction change (2026-10-31, Nur)
- Store app has NO public storefront. Only the sign-in page remains; root `/` renders it; PWA manifest added. Storefront pages, site-header/footer, product-card/image, `/api/auth/signup` and the orders POST are deleted; `/signin` redirects to `/`. Client portal (`/clientportal`) fate undecided (fake settings/wishlist) — do not extend it.
- Full UX/UI differentiation from the single-tenant clone is the goal (layouts, colors, typography, page UX — none should match). POS is to be simplified "like a regular POS". Plan + suggestions in `docs/SAAS-UX-REDESIGN.md`; Nur supplies final designs — do not redesign beyond it unprompted.
- Audit + hardening pass (2026-10-31): store — staff auth required on brands/categories/spec-templates/warranty/validate-imei/upload/portal-returns/sales-commit, row locks (FOR UPDATE) against oversell, server-side discount/quantity validation, `/api/auth/signout` wired into both shells, error/not-found boundaries, POS discount NaN guard, POS mobile overflow + IMEI panel min-width fixes, dashboard page titles + real date caption, staff delete honors failures. Platform — payInvoice amount×months validated (revenue-leak fix), recordMonthlyPayment lifts only payment_overdue, shared clientIp (last XFF entry), rate-limiter pruning, login email preserved, SubmitButton pending/confirm on money+destructive forms, honeypot no longer fakes a ready shop, getInvoice payment fallback, Neon provisioning adopts existing role/db via reset_password (crash-resumable), phone normalization for admin-created shops, env fail-fast via instrumentation.ts, error/loading boundaries. Tests: 54 platform / 19 store pass; both builds green.
