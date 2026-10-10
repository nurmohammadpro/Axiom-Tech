# Axiom Tech plan (revised 2026-10-10)

Full narrative: Claude Docs artifact "Axiom Tech SaaS Platform Admin Plan".

## Architecture
- Monorepo: `apps/store` (tenant-aware store app) + `apps/platform` (control plane).
- Platform DB: its own Postgres (tenants, plans, invoices, payments, platform users, audit).
- Each shop: one Neon database + role. Store app resolves the shop by hostname -> connection string (AsyncLocalStorage around `db`/`txDb`), per-shop auth secret, per-shop settings.
- Runtime: shared store runtime (one container serves many shops) by default; stack-per-shop remains possible for large clients.
- Subscription gate: store `proxy.ts` asks platform for tenant status (cached); trial expired/suspended -> block page; read-only mode possible now that code is editable.

## Provisioning (per shop)
1. Tenant row (trial, trial_ends_at = now + 7d)
2. Neon API: database + role
3. Apply baseline migration + later migrations
4. Seed: owner (scrypt), `store_settings` branding, `feature_settings` per plan, default location, expense categories, leave types
5. Dokploy/Traefik: wildcard route already covers `*.<root>`; no per-shop container needed in shared mode
6. Health check, mark ready

## Lifecycle
trial -> payment recorded + Activate to Production -> active; trial expiry / non-payment -> suspended; cancelled -> export + teardown.

## Phases
0. Import + hardening of store code (secret, debug routes, legacy auth, baseline migration, white-label settings) - 1 wk
1. Platform foundation + provisioning (registry, plans, Neon client, tenant-aware store runtime) - 3 wk
2. BanglaQR billing + gate + trial expiry - 2 wk
3. Self-signup - 1-2 wk
4. Fleet ops: releases/migrations, backups, health, impersonation - 2 wk
5. Growth: analytics, broadcasts, custom domains, Bangla UI
UI/UX updates from Nur slot in as supplied.

## Domain recommendation
- Do not use axiompos.app: it belongs to the separate AxiomPOS retail product (own wildcard, own brand).
- Best: a dedicated product domain (e.g. axiomtech.app) with `*.axiomtech.app` for shops, `admin.axiomtech.app` for the platform, "by AppBrainer" in the footer; appbrainer.tech stays the corporate owner/marketing parent.
- If no new domain: `*.axiom.appbrainer.tech` (shops) and `admin.axiom.appbrainer.tech`.
- Wildcard TLS needs DNS-01 (Cloudflare API token in Dokploy/Traefik).

## Status 2026-10-10
Phase 0 done. Phase 1 platform foundation done (see CLAUDE.md). Next: Neon provisioning pipeline, tenant-aware store runtime + gate client, white-label, then Dokploy deployment.
