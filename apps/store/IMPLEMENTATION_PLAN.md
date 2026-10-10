# Implementation Plan: Product Catalog, Serialized Inventory, POS, and Warranty System

## Overview

This plan implements the canonical product catalog, serialized inventory, POS, and warranty system as specified in the design document. The implementation is prioritized to deliver core transactional integrity first, followed by operational features.

**Current State Analysis:**
- Existing schema has basic products, variants, and inventory tables
- Missing: Serialized inventory units, warranty system, proper sales flow, invoice verification
- Existing order/order_items structure is insufficient for POS requirements
- No barcode/IMEI/serial tracking system
- No transactional sales commit with idempotency

**Architecture Decision:**
- PWA-first modular monolith with PostgreSQL source of truth
- Local indexed catalog for POS scan-first workflow
- Wired USB keyboard-HID barcode scanner support (already in `src/lib/scanner.ts`)
- Transactional sales commit with immutable snapshots
- Print bridge abstraction for silent printing (WebUSB TSPL already in `src/lib/tspl.ts` + `src/lib/usb-printer.ts`)

---

## Blocking Decisions (MUST be confirmed before schema work)

These design-doc §15 decisions shape the database columns and seed data. Do not start schema
until these are answered. Everything else in §15 (gateway, SMS provider, print bridge
deployment) is deferred and does not block the schema.

| # | Decision | Schema impact | CONFIRMED |
|---|---|---|---|
| D1 | Currency | `sales.currency`, label/invoice formatting | **BDT (Taka)** — prices as integer poisha (x100) |
| D2 | VAT-inclusive + rate | `sales.tax_amount`, totals math, line prices | **VAT-inclusive**, rate from settings (default 15%) |
| D3 | Warranty periods | `warranty_policies` (value + unit, flexible) | **Configurable**: none / 7d / 15d / 1mo / 3mo / 6mo / 1y / custom. Policy = `duration_value` + `duration_unit` |
| D4 | Due/credit sales allowed? | `sales` | **Omit due-sale feature** — all sales fully paid; `paid_amount` = `total_amount`, no approval flow |

Non-blocking defaults already chosen (per doc §3, §5, §14):
- Dual IMEI (`imei_1`, `imei_2`) for phones
- Serial uniqueness global within manufacturer class
- Code 128 for product/unit labels; QR for invoice verification
- Invoice verification shows masked customer info only
- No external IMEI validation service (Luhn + uniqueness in-house)

---

## Phase 1: Core Schema Migration (P0)

### 1.1 Catalog and Attributes Schema
**Files:** `src/db/schema-catalog.ts` (new)

Create canonical catalog structure separating product definitions from physical stock:

```typescript
// Core catalog entities
products, product_variants, attributes, attribute_values, variant_attribute_values
warranty_policies, product_media
```

**Key changes from existing:**
- Remove `price` from `products` (price belongs to variants)
- Add `product_type`, `publish_status`, `warranty_policy_id` to products
- Add `barcode`, `attributes_json`, `compatibility_json` to variants
- Create global attributes system (brand, model, storage, color, condition, etc.)
- Add warranty policies with snapshot capability

### 1.2 Serialized Inventory Schema
**Files:** `src/db/schema-inventory.ts` (new)

```typescript
// Physical inventory entities
inventory_units, inventory_balances, inventory_movements, barcodes
```

**Critical design decisions:**
- `inventory_units` for serialized devices (IMEI, SN tracking)
- `inventory_balances` for quantity-only accessories
- `inventory_movements` as audit trail for ALL stock changes
- `barcodes.barcode_type` is required and distinguishes `unit_label` (Code 128) from
  `invoice_verification` (QR). Per doc §2 these are separate concerns and must never be
  conflated — a verification QR must never resolve as a product scan.
- Current stock is computed from movements, not editable directly

### 1.3 Sales and Warranty Schema
**Files:** `src/db/schema-sales.ts` (new)

```typescript
// Transactional entities
sales, sale_lines, sale_payments, sale_documents
warranties, warranty_claims, warranty_events
```

**Snapshot requirements:**
- All sale_lines include `*_snapshot` fields (product_name, attributes, imei, serial, warranty)
- Warranty includes `terms_snapshot` from policy at sale time
- Verification token stored as hash, not raw value

### 1.4 Migration Strategy
**Files:** `src/db/schema.ts` (add new tables in place), `src/db/seed.ts` (extend), `drizzle.config.ts`

> Schema is added to the existing single `src/db/schema.ts` to match the current codebase
> pattern and keep `@/db/schema` imports working for every consumer during the cutover.
> Split into per-domain files later if it grows.

**Danger zone — these existing tables/columns feed the storefront, cart, catalog dashboard,
and barcodes page, and must NOT break mid-migration:**
- `products.price`, `products.inStock`, `products.name`, `products.categoryId`, `products.images`
- `product_variants.quantity`, `product_variants.sku`
- `inventory.quantity`, `orders`, `order_items`, `cart_items`, `wishlist_items`

**Strategy — additive first, dual-write, then cut over:**
1. **Add** all new tables (`attributes`, `inventory_units`, `inventory_movements`, `sales`, …)
   WITHOUT dropping or renaming any existing column. Existing app keeps working.
2. **Dual-write**: POS/commit writes movement + updates legacy `inventory.quantity`/`product_variants.quantity`
   together, so both views stay in sync during the transition.
3. **Backfill** legacy rows into new tables (variants → variants, `inventory.quantity` → `inventory_balances.available_qty`).
4. **Seed** warranty policies and core attributes.
5. **Cut over** consumers (storefront stock display, dashboard catalog, barcodes) to read from
   movement-derived balances, then remove the legacy quantity columns in a later migration.

**Deliverable:** New tables live, existing features unbroken, no stock drift once cut over.

---

## Phase 2: Transactional Sales API (P0)

### 2.1 Sales Commit Endpoint
**Files:** `app/api/sales/commit/route.ts` (new)

**Endpoint:** `POST /api/sales/commit`

**Request body:**
```typescript
{
  channel: "POS" | "Online",
  customerId?: string,
  customerInfo: { name: string, phone: string, email?: string },
  items: [{
    variantId: string,
    inventoryUnitId?: string,  // Required for serialized
    quantity: number,
    priceOverride?: number,
  }],
  discount?: { type: "percentage" | "fixed", value: number },
  payments: [{
    method: string,
    amount: number,
    providerReference?: string,
  }],
  registerSessionId?: string,
  cashierId?: string,
}
```

**Server-side validation:**
1. Validate price or authorized override
2. Check stock availability
3. Validate serialized unit status (not sold/returned)
4. Validate IMEI/serial uniqueness
5. Calculate tax/VAT according to settings
6. Validate payment amounts
7. Generate invoice number, sale number, verification token

**Transactional commit:**
1. Begin database transaction
2. Create sales record with computed totals
3. Create sale_lines with snapshots
4. Deduct inventory (create inventory_movement)
5. Update inventory_balances or inventory_units status
6. Create warranty records
7. Create payment records
8. Generate invoice verification token
9. Commit transaction

**Idempotency:** Use idempotency key to prevent duplicate commits

**Response:**
```typescript
{
  saleId: string,
  saleNumber: string,
  invoiceNumber: string,
  verificationCode: string,
  totalAmount: number,
  changeAmount: number,
  items: saleLine[],
}
```

### 2.2 Barcode Lookup APIs
**Files:** `app/api/barcode/lookup/[barcode]/route.ts` (new)

**Endpoint:** `GET /api/barcode/lookup/{barcode}`

**Response:**
```typescript
{
  type: "variant" | "serialized_unit" | "not_found",
  variant?: {
    id: string,
    productId: string,
    name: string,
    sku: string,
    attributes: Record<string, string>,
    price: number,
    stock: number,
  },
  serializedUnit?: {
    id: string,
    variantId: string,
    imei1?: string,
    imei2?: string,
    serialNumber?: string,
    conditionGrade: string,
    status: string,
  },
}
```

### 2.3 IMEI/SN Validation
**Files:** `app/api/inventory/validate-imei/route.ts` (new)

**Endpoint:** `POST /api/inventory/validate-imei`

**Validates:**
- IMEI format (15 digits, Luhn checksum)
- IMEI uniqueness across system
- Serial number uniqueness per manufacturer

**Status: COMPLETE (2026-08-08)** — all Phase 2 endpoints implemented and smoke-tested live:

- `app/api/sales/commit/route.ts` — transactional (drizzle `neon-serverless` websocket pool), idempotent via `sales.idempotency_key`, server-side stock/unit-status/payment validation, VAT-inclusive totals (`computeSaleTotals`), full `sale_lines` snapshots, per-line warranty creation, unit `sold` + dual-write to `product_variants.quantity` / `inventory.quantity` / `inventory_balances.available_qty`, `inventory_movements`, `sale_payments`, `sale_documents` invoice with verification token, `audit_log`.
- `app/api/barcode/lookup/[barcode]/route.ts` — unit barcode first, then variant barcode; returns `match: "unit" | "variant"`, variant/product + `requiresUnit`.
- `app/api/inventory/validate-imei/route.ts` — Luhn + 15-digit check, uniqueness vs `inventory_units.imei_1/imei_2`.
- `app/api/inventory/receive/route.ts` — transactional unit intake (IMEI batch validation, unit `available`, variant/inventory/balances increment, movement + audit).
- Helper libs: `src/lib/identifiers.ts` (sale/invoice numbers, verification token), `src/lib/imei.ts` (Luhn), `src/lib/warranty.ts` (duration_value/duration_unit expiry), `src/lib/store-settings.ts` (store_info), `src/lib/sale-pricing.ts` (VAT-inclusive math).

Verified via curl: receive → barcode lookup (unit/variant/404) → IMEI validate → sales commit → idempotent replay → sold-unit rejection. Test rows cleaned up.

---

## Phase 3: POS Scan-First Interface — EXTEND existing scanner + POS (P0)

> The scanner hook already exists (`src/lib/scanner.ts`, keyboard-HID wedge) but is only wired
> into the barcodes page. The POS page (`app/(dashboard)/dashboard/pos/page.tsx`) is a
> click-based cart with hardcoded 5% tax and NO commit. This phase wires the working scanner
> into the POS and replaces client-only cart state with server-committed sales. It does NOT
> build a parallel scanner stack.

### 3.1 Local POS Catalog Cache — DONE
**Files:** `src/lib/pos-catalog.ts` (new)

**Features:**
- IndexedDB cache of products/variants for offline barcode resolution
- Background sync with server catalog (every successful fetch refreshes the cache)
- Fallback to server API if cache miss
- Wired into POS via `loadPosCatalog()`; amber "Offline — showing cached catalog" banner + `WifiOff` icon when serving from cache
- Verified: cache persists (key passed explicitly — store has no keyPath/key generator), offline refetch serves cached items, online reload recovers

### 3.2 Wire Existing Scanner into POS
**Files:** `src/lib/scanner.ts` (keep as-is), `app/(dashboard)/dashboard/pos/page.tsx` (update)

**Features:**
- Reuse `useBarcodeScanner` for capture (already detects fast keystrokes + Enter)
- Resolve scanned code via `/api/barcode/lookup/{code}` (cache-first)
- Serialized units: resolve to exact unit, forbid duplicate unit scans
- Quantity-tracked accessories: increment quantity on duplicate scan
- Keep search-as-type fallback for when scanning fails

### 3.3 POS Cart (upgrade existing cart state)
**Files:** `app/(dashboard)/dashboard/pos/page.tsx` (update)

**Features:**
- Line items carry `{ variantId, inventoryUnitId?, qty, price }` instead of bare product qty
- Serialized unit → exact IMEI/serial pinned to the line
- Real-time subtotal / discount / VAT / total from server rules

### 3.4 Customer Info + Payment + Commit
**Files:** `app/(dashboard)/dashboard/pos/page.tsx` (update)

**Fields (name/phone required, email/address optional):**
- Customer name, phone (format validation)
- Discount (percentage/fixed, permission check)
- Payment method, paid amount, change/due calculation
- Commit → `POST /api/sales/commit`, then success panel + silent print trigger

---

## Phase 4: Invoice Generation and Verification (P0)

### 4.1 Invoice Number Generation
**Files:** `src/lib/invoice-number.ts` (new)

**Format:** `INV-{YYYYMMDD}-{sequence}`

**Sequence:** Per-day or global sequential

### 4.2 Verification Token System
**Files:** `src/lib/verification-token.ts` (new)

**Token format:** Cryptographically random 16-byte string
**Storage:** Hashed in database, raw in barcode
**Verification:** Server validates hash, shows limited public info

### 4.3 Invoice Template
**Files:** `src/lib/invoice-template.ts` (new)

**A5 invoice sections:**
- Header (business info, logo, invoice number, verification QR)
- Transaction details (date, channel, cashier, register)
- Customer info
- Line items (with IMEI/SN, warranty, attributes)
- Totals (subtotal, discount, tax, grand total, paid, due, change)
- Verification (QR code, human-readable code)
- Warranty (terms snapshot, dates)
- Footer (timestamp, terms)

**Format:** Server-rendered HTML template, same for PDF and print

### 4.4 Verification Endpoint
**Files:** `app/api/verify/[code]/route.ts` (new)

**Public endpoint:** `GET /api/verify/{code}`

**Response (public info only):**
```typescript
{
  invoiceNumber: string,
  date: string,
  channel: string,
  store: string,
  items: { product: string, quantity: number }[],
  customer: { name: string, phone: string },  // Masked if needed
  total: number,
  paymentStatus: string,
  warrantyStatus: string,
}
```

---

## Phase 5: Invoice Printing (P1)

### 5.1 PDF Generation
**Files:** `src/lib/invoice-pdf.ts` (new)

**Uses:** Puppeteer or similar server-side PDF renderer
**Input:** Canonical invoice data from server
**Output:** A5 PDF file

### 5.2 Print Bridge Abstraction
**Files:** `src/lib/print-bridge.ts` (new)

**Interface:**
```typescript
interface PrintService {
  printInvoice(saleId: string, printerProfile: string): Promise<PrintResult>
  printLabel(unitIds: string[], printerProfile: string): Promise<PrintResult>
}

type PrintResult =
  | { status: "printed" }
  | { status: "failed", reason: string }
  | { status: "fallback", pdfUrl: string }
```

**Implementations:**
- `BrowserPrintService`: Uses `window.print()` with dialog
- `LocalBridgeService`: Calls localhost print bridge
- `FallbackService`: Generates PDF for manual print

### 5.3 Product Label Template
**Files:** `src/lib/label-template.ts` (new)

**Label contents:**
- Business logo/name
- Product short name/variant
- SKU
- IMEI 1/2 or Serial Number
- Warranty end date
- Internal barcode (Code 128)
- Price (optional)
- Condition grade (for used)

**Barcode:** Encodes internal unit code, not full IMEI

---

## Phase 6: Sales History and Management (P1)

### 6.1 Sales History Table
**Files:** `app/dashboard/sales/page.tsx` (update existing)

**Columns:**
- S/L (row number)
- Date
- Product name (snapshot)
- IMEI/SN (from snapshot)
- Category
- Brand
- Attributes
- Warranty (period, status)
- Amount
- Actions (view, invoice, verify, return)

**Features:**
- Server-side pagination
- Filtering (date, channel, cashier, payment method)
- Search (invoice number, customer phone, IMEI/SN)

### 6.2 Sale Details Modal
**Files:** `src/components/dashboard/sale-details-modal.tsx` (new)

**Shows:**
- Sale identity (sale number, invoice number, verification code)
- Customer info
- Cashier, channel, register
- All line items with full snapshots
- Serialized identities (IMEI/SN)
- Payment breakdown
- Discount, VAT, paid/due/change
- Warranty terms snapshot
- Print history
- Return/warranty history

**Actions:**
- Download invoice PDF
- Print/reprint invoice
- Copy verification link
- Initiate return/warranty

---

## Phase 7: Returns and Warranty (P1)

### 7.1 Returns and Warranty Page
**Files:** `app/dashboard/returns/page.tsx` (update existing)

**Search by:**
- Invoice number
- Sale number
- Customer mobile
- Barcode
- IMEI
- Serial number
- Verification code

**Case states:**
```
Requested → Received → Inspecting → Approved / Rejected
Approved → Repair / Replacement / Refund / Store Credit → Closed
```

### 7.2 Warranty Lookup API
**Files:** `app/api/warranty/lookup/route.ts` (new)

**Endpoint:** `GET /api/warranty/lookup?{query}`

**Returns:**
- Warranty status and eligibility
- Original sale info
- Product condition
- Payment/refund status
- Prior claims

### 7.3 Returns/Warranty Settings
**Files:** `app/api/settings/warranty/route.ts` (new)

**Settings:**
- Return windows per category
- Warranty periods per product type
- Exclusions
- Inspection requirements
- Refund methods
- Approval roles
- Receiving hours

---

## Phase 8: Online Storefront Integration (P1)

### 8.1 Payment Confirmation Webhook
**Files:** `app/api/payments/webhook/route.ts` (new)

**Flow:**
1. Payment gateway sends success webhook
2. Server validates provider reference
3. Server commits sale (same endpoint as POS)
4. Server assigns serialized units if applicable
5. Server sends confirmation SMS (via outbox)

### 8.2 Stock Reservation for Serialized Items
**Files:** `app/api/inventory/receive/route.ts` (new)

**Endpoint:** `POST /api/inventory/receive`

**For intake:**
- Validate IMEI/serial uniqueness
- Record condition grade, battery health
- Create inventory_unit record
- Create initial inventory_movement

### 8.3 SMS Outbox
**Files:** `src/db/schema-sms.ts`, `app/api/sms/send/route.ts` (new)

**Table:** `sms_outbox`
- Fields: sale_id, customer_phone, message, status, retry_count
- Processed by background worker

---

## Phase 9: Dashboard Metrics (P2)

### 9.1 Dashboard API Endpoints
**Files:** `app/api/dashboard/metrics/route.ts` (new)

**Metrics:**
- POS sales (count, amount, period)
- Storefront sales (count, amount, period)
- Total sales (combined, net refunds)
- Cash in hand (from register sessions + movements)
- Due amount (outstanding balances)
- Stock alerts (low stock, reserved, damaged)
- Warranty cases (open, nearing deadline)

**Filters:** Date range, store, channel, cashier, payment method

---

## Phase 10: Hardware Optimization (P2)

### 10.1 Print Bridge Service
**Files:** Separate local service (Tauri or similar)

**Features:**
- Listen on localhost only
- Accept authenticated print jobs with short-lived tokens
- Support printer profiles (A5 laser, label printer)
- Return job status
- Restrict to approved templates

### 10.2 Device Profiles
**Files:** `src/db/schema-printers.ts`, `app/api/hardware/printers/route.ts` (new)

**Printer profiles:**
- Label printer (width, height, gap, DPI, barcode symbology, copies)
- Invoice printer (paper size, margins, duplex)

---

## Implementation Sequence

### Sprint 1: Foundation (Week 1-2)
1. Phase 1.1: Catalog and attributes schema
2. Phase 1.2: Serialized inventory schema
3. Phase 1.3: Sales and warranty schema
4. Phase 1.4: Migration from existing schema

### Sprint 2: Core Transactions (Week 3-4)
1. Phase 2.1: Sales commit endpoint with idempotency
2. Phase 2.2: Barcode lookup APIs
3. Phase 2.3: IMEI/SN validation
4. Phase 3.1: Local POS catalog cache

### Sprint 3: POS Interface (Week 5-6)
1. Phase 3.2: POS cart with scanner support
2. Phase 3.3: Customer info form
3. Phase 3.4: Payment and checkout panel

### Sprint 4: Invoices (Week 7-8)
1. Phase 4.1: Invoice number generation
2. Phase 4.2: Verification token system
3. Phase 4.3: Invoice template
4. Phase 4.4: Verification endpoint

### Sprint 5: Printing (Week 9)
1. Phase 5.1: PDF generation
2. Phase 5.2: Print bridge abstraction
3. Phase 5.3: Product label template

### Sprint 6: Sales Management (Week 10-11)
1. Phase 6.1: Sales history table
2. Phase 6.2: Sale details modal

### Sprint 7: Returns and Warranty (Week 12)
1. Phase 7.1: Returns and warranty page
2. Phase 7.2: Warranty lookup API
3. Phase 7.3: Returns/warranty settings

### Sprint 8: Online Integration (Week 13)
1. Phase 8.1: Payment confirmation webhook
2. Phase 8.2: Inventory receiving (procurement deferred)
3. Phase 8.3: SMS outbox

### Sprint 9: Dashboard (Week 14)
1. Phase 9.1: Dashboard metrics API

### Sprint 10: Hardware (Week 15-16)
1. Phase 10.1: Print bridge service (if needed)
2. Phase 10.2: Device profiles

---

## Open Questions Requiring Client Confirmation

| Decision | Impact |
|---|---|
| IMEI validation service | Affects used phone intake workflow |
| Serial uniqueness scope | Global or manufacturer-scoped |
| Invoice QR vs Code 128 | Hardware compatibility |
| Invoice verification public info | Privacy policy implications |
| VAT/tax rules | Compliance requirements |
| Due sales approval workflow | Permission system design |
| Payment gateway | Webhook handling |
| SMS provider | Message format, retry policy |
| Print bridge deployment | Workstation requirements |
| Default warranty periods | Used vs new vs accessories |
| Return windows | Category-specific policies |
| Cash in hand calculation | Register session workflow |

---

## Testing Strategy

### Unit Tests
- Schema migrations
- Barcode validation (IMEI, serial)
- Price/tax calculations
- Verification token generation

### Integration Tests
- Sales commit transaction
- Inventory movement recording
- Warranty creation on sale
- Invoice generation

### E2E Tests
- POS scan-to-sale flow
- Online checkout-to-sale flow
- Returns/warranty initiation
- Invoice verification

---

## Rollout Plan

### Phase 1: Staging
- Deploy to staging environment
- Test migration with copy of production data
- Validate all endpoints

### Phase 2: Pilot Store
- Deploy to one store location
- Monitor for 2 weeks
- Fix issues

### Phase 3: Full Rollout
- Deploy to all locations
- Train staff
- Monitor closely for 1 month

---

## Success Criteria

- [ ] All sales create immutable records with snapshots
- [ ] Serialized devices traceable from intake to sale to warranty
- [ ] No stock drift between inventory systems
- [ ] Invoice verification works from QR code
- [ ] POS scan-first workflow is faster than current click workflow
- [ ] Returns/warranty process completes in under 5 minutes
- [ ] Dashboard metrics match physical cash reconciliation
