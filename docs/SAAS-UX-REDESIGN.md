# Axiom Tech SaaS — UX/UI Differentiation Plan

Status: proposal, 2026-10-31. Nur supplies final visual designs later; nothing here is
implemented without approval. This document answers: "the store app is a clone of our
single-tenant product — how do we turn it into a distinctly different SaaS product in
every way?"

## 1. What must change vs what must stay

**Stays (engine, not UI):** tenancy runtime (proxy gate, per-shop DBs, per-shop
sessions), plan entitlements, data model, APIs, receipt/verification logic, the
platform admin app's logic. These are already SaaS-native and tested.

**Changes (everything the user sees):**

| Layer | Now (clone) | Target (Axiom SaaS) |
|---|---|---|
| Identity | PlayStore-derived layout, Inter-only font (৳ renders broken), generic blue | Own brand system: Axiom mark, slate+teal palette, Hind Siliguri/Bangla-capable type stack, dark POS option |
| Shell | 30+ item sidebar, every feature one flat list | Task-based IA: Sell / Stock / Money / People / System (max ~8 visible items) |
| POS | Power-user table, 7 columns, IMEI picker modal, keyboard codes | Regular-POS model: big product tiles, tap-to-add, guided IMEI step, one payment screen (see §3) |
| Entry | Storefront marketing site | Root = sign-in, installed PWA (done: storefront removed, manifest added) |
| Copy | "Summer sale", US defaults, "Total charged" | Bangladeshi shop reality: taka, BST dates, bKash/Nagad/cash language, Bengali labels option |
| Feedback | Toasts + reloads, silent failures | Inline validation, empty/loading/error states per page, no full reloads |

## 2. Design system foundation (do first, everything else inherits)

1. **Type:** load `Inter` + `Hind Siliguri` (or `Noto Sans Bengali`) so `৳` and any
   Bengali text render everywhere. Token scale: 12/13/14/16/18/22/28.
2. **Color:** one accent (teal `#0d9488` proposed — reads "financial", distinct from
   the clone's navy), semantic tokens (`--sale`, `--muted`, `--line` already exist —
   re-map values, don't add new names). Dark-surface POS variant.
3. **Density:** POS = 44px+ touch targets; back office = compact 32px rows.
4. **Motion:** 150–200ms ease-out only: drawer slide, dialog fade, number tick on
   totals. Nothing decorative.
5. **Primitives:** one ConfirmDialog everywhere (kill `window.confirm`), one
   EmptyState (icon + line + primary action), one DataTable wrapper (already exists:
   SortableTable) with built-in empty/loading/pagination.

## 3. POS simplification (flagship change)

Current POS is a power tool: 7-column sortable table, separate search + scan inputs,
modal IMEI picker, split-payment rows, keyboard shortcuts. A "regular POS" for a
Bangladeshi mobile shop:

```
┌─────────────────────────────┬──────────────┐
│ [Search/scan — one field]   │ CART         │
│ [Tiles: name, price, stock] │ line × qty   │
│  iPhone 13   ৳55,000   3    │ [IMEI ✓]     │
│  Galaxy A55  ৳42,000   2    │ line         │
│  Charger     ৳1,500   20    │ ──────────── │
│  (grid, tap to add)         │ Subtotal     │
│                             │ Discount     │
│  category chips on top      │ [Cash][bKash]│
│                             │ [Nagad][Card]│
│                             │ CHARGE ৳55,000│
└─────────────────────────────┴──────────────┘
```

- **One search field** that accepts name/SKU/barcode/IMEI (already does server-side).
  Scan lands straight in the cart; typed results show as tiles, not table rows.
- **Tap tile → cart.** For serialized items the IMEI step becomes a bottom sheet
  listing available units (largest touch targets), not a modal dialog. If a shop
  sells "any unit is fine" (setting), auto-pick FIFO and skip the sheet.
- **One payment screen:** total, discount (validated), method chips, amount given →
  change. Split payments collapse into "Add split" — rare case, hidden by default.
- **After charge:** receipt preview with Print/WhatsApp/Next customer. No dead ends.
- **Held tickets:** park a sale (name it), recall from a strip above the cart.
- **Offline:** keep IndexedDB catalog cache (already built); queue committed sales
  and sync when back online (needs server idempotency — the idempotency key path
  already exists in /api/sales/commit).
- Keyboard shortcuts stay for the old-timers, but nothing requires them.

## 4. Information architecture

Proposed sidebar (role-filtered, plan-filtered):

- **Sell:** POS, Orders, Customers
- **Stock:** Products (catalog+inventory merged landing), Stock in, Transfers, Barcodes
- **Money:** Cash drawer, Expenses, Reports
- **People:** Staff & HR, Suppliers & Purchases
- **System:** Settings, Audit, Guide

Merges/retirements: `procurement` (orphaned, dead buttons) folded into Purchases;
`hardware` stub either built or removed from nav; `analytics` folded into Reports
until its math is fixed (currently double-counts multi-item sales, repeat rate can
exceed 100%); HR tabs stay inside Staff. `dashboard/suppliers` vs
`dashboard/purchases/suppliers` duplication resolved.

Customer-facing surfaces: the client portal (`/clientportal`) has fake settings and a
fake wishlist — decide: build it properly (warranty check by IMEI + invoice download
would be genuinely useful) or remove it with the storefront. Not shipped as-is.

## 5. PWA application shell

Done in this pass: root = sign-in, manifest, theme color, apple-web-app tags.

Next: service worker (Workbox or hand-rolled) with (a) app-shell precache,
(b) POS catalog + write queue offline strategy, (c) update toast ("New version —
reload"). Note: the codebase deliberately unregisters service workers today (old
sw purge) — that cleanup script must be retired when a real SW ships. iOS
add-to-home-screen walkthrough belongs in first-run onboarding.

## 6. Onboarding & plan UX

- First sign-in → 3-step checklist: set shop info & receipt header, add first
  products (or import), open first sale. Tick-list card on Overview until done.
- Upgrade moments: when a plan-gated nav item is clicked → screen explains the
  feature and says "Ask Axiom Tech to upgrade your plan" (billing is manual/
  BanglaQR — there is no self-serve upgrade yet; don't fake a checkout).
- `?upgrade=` banner (exists) becomes a proper page per feature.

## 7. Localization & Bangladesh specifics

- Copy pass: no US defaults anywhere (checkout defaults already removed with the
  storefront; cash page and settings still need review).
- Date/time: Asia/Dhaka everywhere, `daysUntil` with BST-safe day math (platform).
- Optional Bengali labels via a small dictionary for nav + POS actions; receipts can
  mix Bengali shop names already (needs the font fix).
- Number grouping: stay with 1,00,000 South-Asian grouping? Decide — `taka()`
  currently renders 100,000 (en-US). Bangladeshi invoices commonly use lakh grouping.

## 8. Platform admin differentiation (secondary)

The admin console is already purpose-built (not cloned). Polish list from the audit:
error/loading states (done), per-page titles, tenant table pagination, humanized
status filters, owner-facing invoice delivery (print/email/WhatsApp link) once a
channel exists.

## 9. Rollout order

1. **Foundations** — fonts (৳ fix), tokens, ConfirmDialog/EmptyState/DataTable
   primitives, page titles via route metadata.
2. **POS rebuild** — new POS as `/dashboard/pos` replacement behind a `pos-v2` flag;
   keep old POS until Nur signs off.
3. **IA regroup** — sidebar regrouping + merges, retire dead pages.
4. **Back-office reskin** — apply primitives page by page (Inventory → Orders →
   Products → Customers → Settings).
5. **PWA shell** — service worker + offline queue + update toast.
6. **Onboarding + plan UX** — checklist, upgrade pages.
7. **Bengali layer** — labels + receipts (after Nur's design language exists).

Steps 1–2 are the differentiation core: they change what a user sees in the first
ten seconds and what a cashier touches all day.
