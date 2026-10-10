# Play Store POS & Inventory — Implemented Features

A comprehensive, detail-level inventory of everything implemented in this
codebase: how each feature actually works, and the problem it solves. Every
item is live in the app today. Verified against the running app (all 25
dashboard pages, storefront, client portal) and the source (50 pages,
~100 API routes, 63 tables, 294 commits) as of Oct 2026.

---

## 1. Point of Sale (POS)

**Page:** `/dashboard/pos` · **Commit endpoint:** `/api/sales/commit`

- **Scan-first selling surface** — HID barcode scanners type into the search
  box; lookup resolves a scanned code to a *physical unit* (IMEI/serial/unit
  barcode), a variant, or a product, in that order. Problem: cashiers never
  touch the mouse — scan, cart, cash, print.
- **Unified barcode resolution** (`/api/barcode/lookup/[barcode]`) returns the
  matched unit with its batch cost, acquisition cost, warranty start, and
  category slug — one endpoint feeds POS, order verification, and returns.
- **Offline-tolerant catalog** — the sellable catalog is cached in IndexedDB
  with an offline banner; the counter can keep selling prices/stock when the
  network drops (commit still requires connectivity, by design — money must be
  transactional).
- **Cart model** — per-line qty, unit-price override, sale-level discount
  input that is split **proportionally per line client-side**
  (`round(lineTotal/subtotal × discount)`) so each persisted line carries its
  own `discountAmount`; the server recomputes and enforces totals anyway.
- **Serialized selling** — adding a phone picks a specific physical unit;
  the server re-validates the unit is `available` and — for **official**
  categories — not FIFO-batch-locked at commit time, so two terminals can't
  sell the same IMEI. Pre-owned and unofficial-new units sell in any order.
- **Batch-accurate COGS** — each sale line freezes `costPrice` from
  `unit.acquisitionCost ?? batch.unitCost ?? variant.costPrice`, so profit
  reporting reflects what *that physical piece* cost, not today's catalog cost.
  Problem: mixed-batch stock otherwise distorts margin.
- **Official-device price anchoring** — when receiving a batch for a category
  whose slug starts with `official`, the variant **cost price is only filled
  if empty** (never lowered/raised by newer batches); the **sell price always
  follows the newest batch**. Problem: official-channel devices keep their
  declared cost for warranty/valuation while retail pricing stays current.
  (`app/api/dashboard/stock/receive/route.ts`)
- **Idempotent, transactional commit** — the whole sale (lines, payments,
  stock deduction, movements, warranty rows, loyalty, audit) is one DB
  transaction keyed by a client request id; a retry after a network failure
  can never double-charge or double-deduct.
- **VAT-inclusive pricing** — if settings enable it, displayed prices contain
  VAT and the commit back-computes the tax portion for the books.
- **Payment methods** — cash / card / MFS (bKash, Nagad, Rocket…) with
  paid-amount + change calculation; partial pay recorded on the sale.
- **Customer attach** — name/phone/email on the sale; creates/finds the POS
  customer record and accrues loyalty points.
- **Backdated entry** — optional `soldAt` for recording a sale made earlier
  (power-cut workflows).
- **Exchange receipts** — the receipt engine also prints exchange documents
  (old device + top-up + new device).

## 2. Receipts (A5 print + PDF)

**Library:** `src/lib/receipt.ts` (shared by POS, Orders reprint, Reports
reprint, Exchanges)

- **Two rendering paths, one source of truth** — an HTML print path
  (`window.open` + `document.write`, A5) and a jsPDF fallback that generates
  an identical PDF when popups/printers aren't available.
- **Real scannable CODE128 barcode** of the invoice number on every receipt —
  the Orders page can scan this barcode to pull up the exact sale ("Verify").
- **Brand watermark**, configurable header/footer text, store logo, and
  1–5 print copies (Settings → Receipts).
- **Bengali/English terms footer** — 11 numbered warranty/return terms in
  two columns, overridable per store in Settings (policies append after the
  defaults).
- **Pre-Owned net-price receipts** — for lines whose category is
  `pre-owned-phones` **and** which carry a discount, the receipt folds the
  discount into the printed price: unit price and line total show only the
  final paid price (e.g. 100,000 − 8,000 → prints **92,000**), no discount
  row. A shared `applyNetPricing()` pass runs in *both* renderers so HTML and
  PDF can never drift; mixed carts still balance (remaining non-pre-owned
  discount prints as a normal row; subtotal − discount = grand total always).
  Stored sale data is untouched — display-only. Other categories print
  price + discount row exactly as before.
- **Exchange receipts** — old device valuation, top-up amount, new device.

## 3. Product Catalog & Spec Library

**Pages:** `/dashboard/catalog` (+ Add/Edit), `/dashboard/catalog/add`

- **Brands, hierarchical categories, spec templates** — products are built
  from a brand + category + spec combination; the Spec Library tab manages
  reusable spec definitions (storage, color, RAM…) so variants are generated
  consistently, not free-typed.
- **Variant matrix editor** — generate variant combos from spec values
  (e.g. 128/256 GB × Black/Blue); each variant carries its own SKU, cost and
  sell price, quantity, and reorder point.
- **427+ products** in the live catalog with images, compare-at price,
  description, and per-product tax override.
- **SKU scheme** — `{BRAND}-{MODEL}-{SPEC}` short codes auto-generated and
  unique; used across labels, POS search, and reports.
- **Compare-at price** drives the storefront "Save ৳X" strike-through.

## 4. Serialized Inventory & Warehouses

**Pages:** `/dashboard/inventory` (tabs: Stock / Warehouses / Transfers)

- **`inventory_units` = the physical truth** — one row per physical piece
  with identity type (IMEI1, IMEI2, or serial), optional second IMEI, unique
  unit barcode, battery health, color/specs, condition codes (Cost Code,
  D-Code, Sell Code), batch link, warranty start, lifecycle status
  (`available → sold`, plus locked/returned states).
- **Batches with FIFO sellability (official only)** — stock received together
  forms a batch with its own unit cost; for official-category variants,
  selling consumes the **oldest open batch first** (`fifoSellableUnits`) — a
  newer unit can't sell while an older batch still has stock at the same
  warehouse. Pre-owned and unofficial-new stock has **no batch lock**: any
  available unit sells in any order (auto-pick still prefers oldest).
  Problem: accounting-grade rotation where it matters, counter flexibility
  where it doesn't.
- **IMEI integrity** — client and server validate IMEIs with the Luhn check
  (`src/lib/imei.ts`); duplicates rejected DB-wide (unique index).
- **Accessories get unit barcodes too** — system-generated `PSU-…` codes give
  stock-kept accessories (no factory serial) the same scan-to-sell flow.
- **Per-location balances** — `inventory_balances` tracks available qty per
  variant per warehouse; the legacy `inventory` table stays in sync for
  older reports.
- **Movement log** — every receive, sale, transfer, return, and order
  confirmation writes `inventory_movements` rows (before/after qty, source
  type/id, reason) — full stock forensics.
- **Category cost summary** — the Stock tab header shows live units + cost
  value per category (Pre-Owned ৳3.15M, Official ৳1.32M…), total ৳5.14M.
- **Sortable, filterable table** — by product/variant/SKU/price/stock/status,
  search by name/SKU/attribute, warehouse filter, PDF/CSV export
  (shared `sortable-table` component).
- **Transfers tab** — move units between warehouses with movement logging and
  role scope enforcement (managers only see their own warehouse).

## 5. Stock Receiving & Purchase Intake

**Flow:** Purchases → Receive (modal) · **API:** `/api/dashboard/stock/receive`

- **Per-unit intake grid** — receiving a phone PO line opens a grid where
  each row is one physical unit: IMEI1 (+optional IMEI2), serial, battery
  health, color, per-unit **acquisition cost**, and per-unit sell price.
  Accessories/quantity stock receive by count instead.
- **Line-level category aware pricing** (see §1) — official lines anchor
  variant cost on first fill; every line updates sell price to the newest
  batch price; pre-owned/other lines may adjust cost.
- **Auto codes on receive** — each unit gets Cost/D/Sell condition codes and
  a printable label; received stock is immediately scannable in POS.
- **Movement + audit rows** — every receive logs stock movements and an audit
  entry ("Stock received", variant, location).
- **Purchase-order lifecycle** — `pending → in transit → partial → received`;
  partial receipts allowed (receive 3 of 5 today, the rest tomorrow); overdue
  detection against expected date.

## 6. Purchasing & Suppliers

**Pages:** `/dashboard/purchases` (tabs: Purchase Orders / Suppliers / Payable
Reports), `/dashboard/purchases/new`, `/dashboard/procurement`, `/dashboard/stock`

- **277 live POs** with auto-numbered references (`PO-{timestamp}-{rand}`),
  supplier, receive location, notes, per-line qty/cost/sell, committed value
  tracking.
- **New PO builder** — search-as-you-type supplier picker, receive-location
  selector, line items with product search, running total/units summary.
- **Suppliers directory** — types (Local Customer, Moin Telecom, Mollah
  Telecom…), contacts, purchase history; **soft-delete** so historical POs
  and payables keep their supplier name.
- **Payable reports** tab — what the shop owes, per supplier.
- **Procurement requests** — `/dashboard/procurement` aggregates POs with
  lead-time stats (avg. lead time, received this week, overdue, committed
  value) for the buying workflow.
- **Stock orders view** — `/dashboard/stock` is the receiving-queue: open
  POs, committed value, one-click **Receive** per PO.

## 7. Orders (Online) & Unified Order View

**Pages:** `/dashboard/orders`, `/dashboard/orders/[id]` · **API:**
`/api/orders/[id]`

- **One table, two channels** — POS sales and storefront orders in a single
  searchable list (search by customer • phone • invoice • barcode • IMEI •
  order ID — Enter or the Verify button looks up an exact receipt barcode).
- **Status pipeline** with counters: Pending → Confirmed → Payment Confirmed
  → Sent to courier → Completed, plus Returned; per-status tabs with counts.
- **Status-driven stock** — moving an online order past `pending` deducts
  stock once (idempotent via the movement log); marking it `returned`
  restores the exact units. Serialized online orders mark the *same oldest-
  batch* units sold so POS can't re-sell that IMEI.
- **Unified detail endpoint** — the POS branch of `/api/orders/[id]` reshapes
  a sale into the order shape (with per-line `discountAmount`,
  `categorySlug`, gross line totals) so reprinting, viewing, and verifying
  work identically for both channels.
- **Invoice reprint** — direct "Print invoice" from the detail panel, using
  the same receipt engine (pre-owned net pricing included).
- **Date-range + warehouse filters, CSV/PDF export.**

## 8. Returns, Exchanges & Warranty

**Pages:** `/dashboard/returns`, `/dashboard/exchanges`,
`/dashboard/exchange-policies`, `/dashboard/warranties`

- **RMA overview** — online RMAs and in-store returns in one dashboard:
  open RMAs, in-repair count, refunded-last-30-days total, channel split.
- **In-store returns** — pick a sale, choose restock or scrap, refund method
  (cash / original payment); returned units go back to `available` with
  movement + audit rows.
- **Device exchange system** — customer brings an old device: staff verify
  it (IMEI check), an **exchange policy** computes the trade-in deduction
  (configurable percentage/conditions per category), and the flow prints an
  exchange receipt; full exchange history tab. The traded-in device lands as
  **immediately sellable stock under its own model** (own variant, own
  batch, agreed cost as acquisition cost, condition codes, sell price) at
  the exchange warehouse, and the handed-over new-device unit is marked sold
  at the same time — no double-sell.
- **Warranty registry** — 47+ warranties auto-created at sale time from the
  unit + policy; Overview tab with Active/Claimed/Void states, expiry dates,
  IMEI-level search.
- **Warranty claims workflow** — customer files → staff approve/reject →
  replacement tracking; claims tab links the claim to the sale and unit.
- **Warranty policies** — per-category duration and terms; POS lines pick a
  policy which sets the unit's `warrantyStartAt`/expiry on commit.
- **Public warranty check** (page at `/warranty`) — any visitor enters
  IMEI / serial / unit code and sees status + expiry, no login. Problem:
  cuts warranty-status phone calls to zero.

## 9. Customers, Loyalty & Campaigns

**Pages:** `/dashboard/customers`, `/dashboard/campaigns`

- **Customer directory** with channel attribution (Online / POS / Both),
  items bought, total and average spend, NID capture, search by
  name/email/phone/NID; CSV/PDF export; pagination.
- **46+ customers, ৳1.11M lifetime** — top customers sortable by spend.
- **Loyalty program** (Settings → Loyalty): points per ৳100 spent,
  redemption rate (1 pt = ৳X), minimum redeemable balance, welcome bonus;
  points accrue on POS commit and show in the client portal.
- **Campaigns** — create/schedule promotions with active/upcoming/completed
  states and average-discount stats; surfaces on the dashboard home.

## 10. Cash Management & Expenses

**Pages:** `/dashboard/cash`, `/dashboard/expenses` (+ New, Budgets, Petty
Cash, Recurring, Categories, Daily)

- **Cash dashboard** — today's gross sales, cash in drawer, card sales, MFS
  sales; sales-by-payment-method breakdown (with % bars); cash by channel
  (POS warehouses vs online COD); register movement table; end-of-day panel.
- **Register sessions** — open with a counted opening float, sell against the
  open session (`sales.register_session_id`), close with a counted balance;
  the server computes expected cash (opening + POS cash − refunds) and stores
  the **variance** — drawer-shortfall accountability per shift.
- **Expenses suite** (5 sub-views): Overview (this month / last month /
  awaiting payment / **VAT 6-mo / TDS 6-mo** totals), New Expense, Budgets,
  Petty Cash, Recurring expenses; filter by status (pending/approved/
  rejected/cancelled), payment method (cash/bKash/Nagad/Rocket/bank/card/
  cheque), category, and date range; CSV export.
- **Expense categories** (`/dashboard/expenses/categories`) and a **daily
  ledger** (`/dashboard/expenses/daily`) for day-by-day entries.
- **Net profit on the dashboard** = gross sales − recorded expenses, so the
  home screen is a real P&L glance, not vanity revenue.

## 11. Reports & Analytics

**Pages:** `/dashboard/reports`, `/dashboard/analytics`

- **8 report tabs** — Orders, POS Sales, Warehouse, Inventory, Customers,
  **Profit/Loss**, Returns, **Staff Performance** (sales per cashier) — each
  with warehouse scope, date range, PDF + CSV export.
- **POS Sales tab** shows sale no., invoice no., date, customer, payment,
  **cashier**, warehouse, total — and drives per-line reprint with the full
  receipt data (category slug + per-line discounts included).
- **Analytics page** — gross sales, **net profit (selling − cost)**,
  conversion (55 of 46 customers), repeat rate, sales by channel, **revenue
  by brand**, new-vs-returning customer cohort chart, 7-day revenue trend
  with week-over-week delta, PDF/CSV export.
- **Dashboard home** — out-of-stock and low-stock watchlists with "+N more"
  expansion, inventory cost value, gross sales, POS vs online split, pending
  returns, active campaigns, net profit after expenses, orders, customers,
  and a 7-day revenue chart.

## 12. Audit, Compliance & Administration

**Pages:** `/dashboard/audit`, `/dashboard/admin/features`

- **Audit log** — every sensitive action (sale commit, stock receive,
  transfer, settings change, login…) recorded with timestamp, actor, action,
  entity, and summary; 374+ entries live.
- **Viewer features** — search by actor/action/entity, statistics and
  analytics tabs, compliance view, **saved filters**, page-size control.
- **Sidebar permissions** (`/dashboard/admin/features`) — a matrix of all
  **30 dashboard pages × role** with Show All / Hide All per section;
  changes apply immediately (and are enforced **server-side** via feature
  flags — hiding a page also revokes its APIs, see §14).

## 13. Staff & Authentication

**Pages:** `/dashboard/staff`, `/signin`, `/signup`

- **Staff management** — owner/manager/salesman roles, warehouse assignment
  ("assign managers and salesmen to the warehouse they work at"), 30-day
  sales per staff member, activate/deactivate.
- **Warehouse scoping** — managers/salesmen only see and mutate their
  assigned warehouse's stock, sales, and reports; owners see all.
- **Email + password auth** with scrypt hashing; legacy plaintext passwords
  transparently upgrade to scrypt on next successful login.
- **Signed HMAC session tokens** (7-day expiry) delivered as httpOnly cookie
  *and* accepted as `x-session-token` header (POS terminals) — the server
  always verifies the signature; bare user-id headers are never trusted
  unless `AUTH_ALLOW_LEGACY=1`.
- **Owner-only guards** on settings, staff, permissions, and expenses APIs.

## 14. API Security & RBAC (edge gate)

**Lib:** `src/lib/authz.ts` (`getScope`, `requireStaff`, feature
permissions)

- **Every dashboard API re-checks authorization** — role (staff vs customer
  vs anonymous), warehouse scope, and per-feature permission flags; customers
  can only read their own orders; anonymous gets 401; staff-only mutations
  get 403 with a typed error body.
- **Feature flags are server-enforced** — hiding "Expenses" for managers in
  the sidebar also blocks the expense APIs for them, not just the menu item.
  Problem: UI hiding alone is not access control.

## 15. Label & Hardware Printing

**Pages:** `/dashboard/barcodes`, `/dashboard/hardware`

- **Barcode label workspace** — searchable product/variant list with per-row
  Print ×N quantity multipliers, select-all, and live "Print (n)" counter.
- **Label settings tab** — size presets (40×25 mm small shelf label shown
  live), content toggles (price, cost, brand…), preview before print.
- **Two print engines** — browser print (HTML labels) and **TSPL command
  generation** for thermal label printers, plus direct **WebUSB** printer
  support for kiosk-style counters.
- **Hardware page** — pair printers/scanners/terminals (WebUSB/BT), digital
  signage display config with a media library.

## 16. Settings

**Page:** `/dashboard/settings` (6 tabs)

- **General** — business name, tagline, contact, address, web, logo upload,
  currency (BDT/USD/EUR/GBP/INR).
- **Locations** — warehouses/outlets with code, address, phone, live stock
  counts ("436 SKUs · 371 units"), active toggle; stock transfers between
  them.
- **Taxes** — default rate, VAT registration number, VAT-inclusive pricing
  toggle, per-product and per-location overrides.
- **Payments** — enabled methods and bank account registry.
- **Receipts** — header/footer text, logo-on-receipt, tax breakdown toggle,
  default copies, editable terms & conditions (one per line, appended after
  the built-in Bengali defaults).
- **Loyalty** — enable, points per ৳100, redemption rate, minimum redeem,
  welcome bonus.

## 17. Storefront (public site)

**Routes:** `/`, `/store`, `/product/[id]`, `/cart`, `/checkout`,
`/order-confirmation`, `/warranty`, `/signin`, `/signup`

- **Marketing home** — hero campaign banner ("Summer sale · up to 20% off"),
  this-week's-deals row with strike-through pricing, popular phones,
  accessories carousel, and a **60+ brand wall**.
- **Store listing** — 428 products, Featured/All sorting, brand filter chips,
  category nav; product cards show stock state.
- **Product detail** — gallery, specs, variant/price display, **Add to cart**
  and **Buy now**, related brand links.
- **Cart & checkout** — cart context with persistence, shipping address,
  payment-method choice, free-delivery threshold banner, order confirmation
  page with order number.
- **Checkout→operations bridge** — a confirmed order immediately: deducts
  serialized stock oldest-batch-first (the same units POS would sell), logs
  movements, and appears in the dashboard Orders pipeline.

## 18. Client Portal (customer self-service)

**Routes:** `/clientportal` (+ orders, orders/[id], returns, addresses,
wishlist, settings, guide)

- **Portal home** — member-since, total orders, **loyalty points balance**,
  saved addresses count, recent orders.
- **Order history + detail** — status timeline, items, totals; reorder
  context.
- **Return requests** — customer-submitted RMAs land in the dashboard
  Returns page for staff action.
- **Address book, wishlist, profile settings** — full CRUD via dedicated
  APIs, scoped to the logged-in customer only.

## 19. Cross-cutting UX

- **Command palette (⌘K)** — global search across orders, products,
  customers; keyboard-first navigation.
- **In-app guide** (`/dashboard/guide`) — per-section walkthrough
  (Billing/POS, Orders, Inventory, Catalog, Customers, Returns, Campaigns,
  Reports, Settings) plus a **keyboard shortcuts** reference.
- **Collapsible sidebar** — full labels ↔ icon-only rail, persisted.
- **Sortable tables everywhere** — shared `sortable-table` component
  (documented conventions in `SORTABLE_TABLE_GUIDE.md`), CSV/PDF export on
  every major list.
- **Confirm dialogs** for destructive actions; toast notifications (sonner).
- **Bengali-first field data** — the app runs in Bangladesh: Bengali receipt
  terms, ৳ formatting, MFS payment methods, VAT/TDS tax fields.

## 20. Platform & Infrastructure

- **Next.js 16 App Router** + React 19 server components; TanStack Query on
  the client; typed API layer (`src/lib/api.ts`) shared by every page.
- **Drizzle ORM on Postgres** — 63 tables, versioned SQL migrations; **Neon
  serverless** in production.
- **Deployment** — Docker image → Docker Swarm service.
- **Seed script** for demo data; `.env`-driven configuration.
- **Audit + movement logging** as first-class citizens, not afterthoughts —
  every stock or money mutation is traceable to who/when/what.
