# Updated Product Catalog, Serialized Inventory, POS, and Warranty System Design

**Prepared by Manus AI**  
**Repository:** `nurmohammadpro/playstore-storefront`  
**Status:** Requirements normalized for the next design and implementation phase.

## 1. Confirmed essential requirements

The system must treat product identity and post-sale verification as the highest-priority domain. Every sellable item must have a catalog identity, global variants and attributes, warranty information, a barcode label or sticker, and a verifiable sales record. Serialized devices must be traceable from stock intake through sale, warranty, return, and historical verification.

The required product groups are:

| Product group | Tracking requirement | Examples |
|---|---|---|
| Used/Pre-owned | Individual unit tracking is mandatory where applicable; condition and warranty are unit-specific | Used mobile phone, laptop, drone |
| Official/New | SKU/variant quantity tracking plus IMEI or serial tracking for controlled devices | New phone, laptop, drone, high-end device |
| Accessories | SKU/barcode quantity tracking; serial tracking only when the accessory requires it | Charger, case, cable, adapter, memory card |

The system must support the following identity types:

| Identity | Required use |
|---|---|
| Product ID | Stable catalog-level identity. It must never be reused after deletion. |
| Variant ID | Identity for global attributes such as brand/model/storage/color/region or compatibility. |
| SKU | Human/business stock identity used for catalog, reports, and inventory. |
| Barcode | Scannable label/sticker identity for the product or sellable unit. |
| IMEI | Required for mobile phones and dual-IMEI devices where applicable. |
| Serial number | Required for laptops, drones, smart watches, cameras, and other serialized high-value devices. |
| Inventory unit ID | Internal immutable identity for one physical serialized unit. |
| Sale/invoice ID | Official business transaction identity. |
| Verification token | Signed, non-guessable reference encoded in the receipt/invoice barcode or QR code. |

## 2. Important distinction: product barcode versus invoice verification barcode

There are two different barcode purposes and they must not be conflated.

The **product barcode** identifies an item or inventory unit for receiving, stock lookup, POS scanning, warranty lookup, and returns. A product label may encode a GS1/EAN/UPC barcode supplied by the manufacturer, a business-generated Code 128 barcode, or a combined business code containing SKU and unit identity. For serialized goods, the label should be linked to the exact IMEI, serial number, or internal unit ID.

The **invoice verification barcode** proves that a receipt or invoice record exists in the company system. It should encode a signed verification URL or compact verification token, not only a visible invoice number. When scanned by a customer or staff member, it should open a public verification page showing limited information such as invoice status, invoice number, date, store/channel, product summary, and masked customer information. It must not expose private payment data or unrestricted personal information.

A barcode alone is not proof if the content can be copied. The verification endpoint must validate the token against the server, and the token should be generated from a cryptographically secure random value or a signed payload. The invoice should also display a human-readable invoice number and a short verification code so staff can verify it when scanning is unavailable.

## 3. Recommended barcode format and hardware

### 3.1 Product and unit labels

Use **Code 128** for business-generated product and unit labels unless a supplier or regulatory requirement mandates EAN/UPC or another standard. Code 128 supports alphanumeric SKUs and serial references and is well suited to label printers. Avoid putting the full IMEI or long serial number into an unnecessarily dense barcode if a compact internal unit code can be resolved by the server. The printed label can show the readable SKU, IMEI/SN, warranty end date, and price while encoding the internal barcode value.

For a serialized unit, the label should contain:

```text
Business name or logo
Product short name / variant
SKU
IMEI 1 and IMEI 2, or Serial Number
Warranty end date or warranty period
Internal barcode value
Optional price and condition grade
```

For mobile phones, the system must validate IMEI format and uniqueness according to the business policy. For laptops, drones, and other serialized devices, the system must validate serial-number uniqueness within the relevant manufacturer or device class. A device cannot be received, sold, returned, or transferred as a different unit without an explicit authorized correction process.

### 3.2 Invoice verification barcode

Use a **QR code** on A5 invoices for the verification URL because it can carry a URL and is easier to scan from paper. If the business specifically requires a one-dimensional scanner-compatible invoice code, add a Code 128 invoice verification barcode as well. The recommended production invoice includes both a QR code and a human-readable verification URL/code.

### 3.3 Scanner recommendation for a PWA

For the PWA, the best first choice is a **wired USB barcode scanner operating in keyboard-HID mode**. The scanner behaves like a keyboard, so it works in Chromium, Windows, and macOS without a native browser API, special drivers, or Bluetooth pairing. Configure it to append an Enter suffix after each scan. The POS keeps focus in a hidden or visible scan input, resolves the scanned value locally, and adds the item to the cart.

A wireless scanner is acceptable when it also operates as keyboard-HID over a stable Bluetooth or 2.4 GHz receiver. A scanner that requires a vendor-specific serial/API protocol, Bluetooth profile configuration, or native device permissions is a poor fit for a pure PWA. If future requirements include USB scale integration, cash drawer control, printer status, or vendor-specific terminal APIs, use a signed Tauri shell or a local print/device bridge while keeping the same web POS interface and server domain logic.

## 4. Canonical catalog and inventory model

The current repository has `products`, `product_variants`, and `inventory`, but the new requirements require a stronger separation between catalog definitions and physical stock.

### 4.1 Catalog entities

```text
products
  id, product_type, brand_id, model_name, description, publish_status,
  warranty_policy_id, default_tax_class_id, created_at, updated_at

product_variants
  id, product_id, sku, title, barcode, selling_price, cost_price,
  attributes_json, compatibility_json, active, created_at, updated_at

attributes
  id, code, name, data_type, scope

attribute_values
  id, attribute_id, code, label, sort_order

variant_attribute_values
  variant_id, attribute_value_id

warranty_policies
  id, name, duration_value, duration_unit, coverage_type,
  terms, exclusions, active

product_media
  id, product_id, variant_id, storage_key, alt_text, sort_order
```

Global attributes should be reusable across product types. Examples include brand, model, storage capacity, RAM, color, condition grade, region, compatibility, battery health, and network support. Attribute definitions should contain data type and validation rules rather than being arbitrary unstructured text. Product-specific details can still be stored in a controlled extension table or JSON field, but essential searchable fields such as IMEI, serial number, SKU, warranty, and category should be indexed columns.

### 4.2 Physical inventory entities

```text
inventory_units
  id, variant_id, unit_code, barcode, identity_type,
  imei_1, imei_2, serial_number, condition_grade, battery_health,
  inspection_status, acquisition_cost, current_price, status,
  warranty_start_at, warranty_end_at, location_id,
  received_at, sold_at, created_at, updated_at

inventory_balances
  id, variant_id, location_id, available_qty, reserved_qty,
  damaged_qty, in_transit_qty, updated_at

inventory_movements
  id, variant_id, unit_id, location_id, movement_type,
  quantity, before_qty, after_qty, source_type, source_id,
  reason, actor_id, created_at

barcodes
  id, value, barcode_type, variant_id, inventory_unit_id,
  status, printed_at, replaced_by_id, created_at
```

Serialized devices should use `inventory_units`. Quantity-only accessories can use `inventory_balances`. A serialized product may also have a balance projection for reporting, but the unit record is authoritative for the physical item. The system must not maintain independent editable quantities in `products.inStock`, `product_variants.quantity`, and `inventory.quantity`; that duplication creates stock drift.

Every inventory change must append an `inventory_movements` record. The current stock balance is a fast projection derived and updated transactionally from those movements. Stock adjustments, replacements, corrections, transfers, returns, warranty intake, and sales must never erase historical movement records.

## 5. Warranty and serialized lifecycle

Warranty must be stored as a policy and as a concrete entitlement attached to the sold unit. A product-level default warranty is not enough because used/pre-owned devices may receive different coverage from new devices, and warranty can begin at sale rather than receipt.

```text
warranties
  id, sale_line_id, unit_id, customer_id, policy_id,
  starts_at, expires_at, status, terms_snapshot, created_at

warranty_claims
  id, warranty_id, unit_id, customer_id, claim_number,
  issue_description, intake_condition, status, diagnosis,
  resolution, cost, received_at, resolved_at, assigned_to

warranty_events
  id, claim_id, event_type, note, actor_id, created_at
```

The terms and exclusions must be copied into a snapshot at sale time. If settings change later, historical invoices and warranty decisions must remain tied to the terms that applied on the original sale. The warranty page should allow staff to search by invoice number, barcode, IMEI, serial number, customer mobile number, or verification code.

A typical lifecycle is:

```text
Received → Inspected → Available → Reserved → Sold → Warranty Active
                                      ↘ Returned → Warranty Review → Repaired/Replaced/Refunded
```

The system must prevent a unit in `Sold`, `Returned`, `Repair`, or `Disposed` status from being sold again unless an authorized workflow returns it to an allowed sellable state.

## 6. Invoice and receipt requirements

The sample invoice provides a strong visual starting point. It includes company information, invoice number, order number, date, payment terms, customer details, salesperson, channel, product description, serial number, quantities, prices, discounts, totals, amount in words, paid amount, due amount, remarks, signatures, warranty terms, printing metadata, and footer information.

The production A5 invoice should retain those sections and add the following mandatory information:

| Section | Required production fields |
|---|---|
| Header | Business name, logo, store/location, address, phone, tax/VAT registration if applicable, invoice title, invoice number, invoice verification QR/barcode |
| Transaction | Sale ID, order number, invoice issue date/time, channel (`POS` or `Online`), register/store, cashier/salesperson, payment status |
| Customer | Name, mobile number, optional email, optional address |
| Line items | S/L, product name, product type, brand, variant attributes, SKU, barcode, IMEI 1/IMEI 2 or serial number, warranty period/end date, quantity, unit price, discount, tax/VAT, line total |
| Totals | Subtotal, discount percentage/fixed amount, VAT/tax, grand total, paid amount, due amount, exchange/change, payment method or split tender details |
| Verification | Human-readable invoice number, public verification URL/code, QR code or Code 128 barcode, instruction to verify by scanning or entering the code |
| Warranty | Warranty policy snapshot, start/end date, coverage and exclusions, return/warranty instructions |
| Footer | Printed/generated timestamp, printed by, page number, business contact, terms and conditions |

The invoice verification barcode must be generated at sale finalization and permanently attached to the sale. It must not change when the invoice is downloaded or reprinted. Reprints should display `DUPLICATE` or `REPRINT` according to the business policy while preserving the original invoice identity and audit record.

The PDF and printed invoice must be generated from the same canonical invoice-rendering data. Do not generate one layout in the browser and a different layout on the server. The server should render a deterministic invoice template or provide a canonical invoice payload that the print service and PDF generator both use.

## 7. POS scan-first workflow

The POS should be designed around the wired scanner rather than product cards. The cashier workflow should be:

1. The cashier signs in or switches into an authorized cashier session.
2. The POS opens a focused scan input automatically.
3. A scan returns a barcode value. The local catalog resolves it to a variant or serialized unit without a network round trip.
4. If the item is a serialized device, the POS confirms that the unit is available and adds the exact IMEI/serial to the cart. It must not add an arbitrary model quantity when the sale requires a specific unit.
5. Multiple scans add multiple line items. Duplicate scans increase quantity only for quantity-tracked items; a serialized unit cannot be added twice.
6. The cashier fills the required customer name and mobile number. Email and address are optional unless the configured policy requires them for a given sale type.
7. The cashier optionally applies a percentage or fixed discount. Permission rules determine whether approval is required.
8. VAT/tax is calculated according to settings and can be overridden only by authorized users where allowed.
9. The cashier selects payment method, enters paid amount, and the POS calculates change/exchange and optional due amount.
10. The server commits the sale atomically, deducting stock and creating the invoice, warranty entitlement, payment record, audit event, and verification barcode.
11. The POS displays a compact success result and triggers silent printing through the configured print path.
12. If silent printing fails, the POS immediately offers a generated PDF download and a manual print action. The sale itself must remain committed; printing failure must not roll back a completed sale.

### Required sale validation

Before commit, the server must validate the current price or authorized override, stock availability, serialized unit status, IMEI/serial uniqueness, customer mobile format, discount permission, tax calculation, payment amount, due policy, and register status. The server—not the browser—must recalculate totals and decide the final inventory result.

### Required sale tables

```text
sales
  id, sale_number, invoice_number, channel, customer_id,
  store_id, register_session_id, cashier_id, status,
  subtotal, discount_amount, tax_amount, total_amount,
  paid_amount, due_amount, change_amount, currency,
  verification_token_hash, created_at, finalized_at

sale_lines
  id, sale_id, variant_id, inventory_unit_id, sku,
  product_name_snapshot, attributes_snapshot, imei_snapshot,
  serial_snapshot, warranty_snapshot, quantity, unit_price,
  discount_amount, tax_amount, line_total

sale_payments
  id, sale_id, method, amount, provider_reference,
  status, received_at, confirmed_at

sale_documents
  id, sale_id, document_type, version, storage_key,
  verification_code, printed_at, downloaded_at, reprint_count
```

The `*_snapshot` fields are intentional. If a product name, attribute, price label, or warranty policy changes later, the historical sale and invoice must continue to show what was sold at that time.

## 8. Silent printing and fallback strategy

A pure PWA cannot reliably perform silent printing to an arbitrary laser or label printer using only `window.print()`. Browser printing normally presents a print dialog and does not provide a cross-platform guarantee of printer selection, printer status, or silent output. Therefore, the recommended staged approach is:

| Stage | Printing approach | Recommendation |
|---|---|---|
| Initial pilot | Browser print dialog for A5 invoice plus downloadable PDF | Use this while validating invoice layout and printer compatibility. |
| Production browser deployment | Local print bridge on each POS workstation | Use a small signed local service that accepts authenticated print jobs and prints to configured laser/label printers. Restrict it to localhost, allow only approved templates, and require device registration. |
| Hardware-heavy deployment | Tauri shell around the same POS | Use when cash drawers, printer status, USB devices, kiosk mode, or vendor APIs require a native bridge. |

The print bridge should not receive arbitrary HTML from the browser. It should accept a structured print request containing a sale/invoice ID, template type, printer profile, and authenticated short-lived job token. The bridge should request the canonical document from the server or receive a validated PDF/label payload. It should record job status such as `queued`, `printed`, `failed`, and `retrying`.

A5 laser invoice printing and product label printing should be separate printer profiles. The label printer profile must define label width, height, gap, DPI, barcode symbology, and number of copies. The invoice profile must define A5 paper, margins, duplex behavior if applicable, and PDF/HTML rendering. Never send an A5 document to a label printer or a label command to a laser printer.

## 9. Online storefront payment and stock deduction

Anonymous storefront checkout is allowed, but a storefront sale must not become a completed sale merely because an order form was submitted. The flow should be:

```text
Checkout created → Payment pending → Gateway success verified → Sale committed
                                      ↘ Failed/expired → No final stock deduction
```

For limited serialized items, the system may create a short reservation while payment is pending. When the payment gateway reports success, the server must verify the gateway event or provider reference, atomically commit the sale, assign the exact serialized unit where required, deduct inventory, create the invoice and warranty record, and publish a stock-change event. If payment succeeds but sale commit fails, the system must place the order into a reconciliation state and prevent duplicate fulfillment.

The customer confirmation SMS should be sent only after verified payment and successful sale commit. SMS delivery should run asynchronously through an outbox/worker so a slow SMS provider does not delay the checkout response. The sale should show `SMS pending`, `SMS sent`, or `SMS failed` in the operational record, with retry capability.

## 10. Dashboard metrics

The dashboard must display separate and combined metrics for POS and storefront sales. The metrics should come from committed sales, not client-side cart state.

| Metric card | Definition |
|---|---|
| POS sales | Number and amount of finalized sales where channel is `POS` for the selected period. |
| Storefront sales | Number and amount of finalized paid online sales for the selected period. |
| Total sales | Combined finalized sales, with refunds shown separately or netted according to settings. |
| Cash in hand | Expected cash for open register sessions plus recorded cash movements, less cash drops and approved payouts. It must not simply equal total sales. |
| Due amount | Outstanding customer balances, separated from completed paid revenue. |
| Stock alerts | Count of low-stock, reserved, damaged, repair, or reconciliation items according to dashboard settings. |
| Warranty cases | Open warranty/return cases and cases nearing deadline if required. |

Dashboard filters must include date range, store/location, channel, cashier, payment method, and product category where relevant. Metric queries should use indexed sales and payment tables or maintained reporting projections; they must not scan every line item on every dashboard load once data grows.

## 11. Sales history

The sales history page must be backed by a paginated server-side data table. The requested columns are:

| Column | Behavior |
|---|---|
| S/L | Display row number for the current page or stable sequence if required. |
| Date | Sale/finalization date and time. |
| Product name | Product name snapshot from the sale line. |
| IMEI/SN | IMEI 1/2 or serial snapshot; show `N/A` for non-serialized accessories. |
| Category | Product category/type snapshot. |
| Brand | Brand snapshot. |
| Attributes | Variant attributes such as storage, color, RAM, or compatibility. |
| Warranty | Warranty period, expiry, and current status. |
| Amount | Line amount or sale amount according to the selected table view. |
| Actions | View details modal, invoice download, print/reprint, verification, and authorized return/warranty action. |

The details modal should show sale identity, invoice number, verification barcode/code, customer, cashier, channel, register/store, all lines, serialized identities, payment breakdown, discount, VAT, paid/due/change, warranty terms, print history, and return/warranty history. The invoice download must regenerate or retrieve the immutable canonical document and must not change the original sale.

## 12. Returns and warranty page

The returns and warranty page is required for the first operational release. Procurement is explicitly deferred and should not block the current design, but inventory receiving may still need a minimal controlled method for adding stock and serialized units until a procurement module is implemented.

The page must support search by invoice number, sale number, customer mobile number, barcode, IMEI, serial number, or verification code. Staff should be able to view eligibility, warranty status, original sale, product condition, payment/refund status, and prior claims.

Recommended case states are:

```text
Requested → Received → Inspecting → Approved / Rejected
Approved → Repair / Replacement / Refund / Store Credit → Closed
```

Settings should define return windows, warranty periods, category-specific policies, exclusions, inspection requirements, refund methods, warranty complaint receiving hours, and approval roles. However, the applied policy must be copied to the sale/warranty snapshot so changing settings does not rewrite historical rights.

A return or warranty action must create an inventory movement and financial adjustment. A returned serialized unit cannot immediately become available without inspection. Possible outcomes include `restock`, `repair`, `replace`, `supplier claim`, `damaged`, `quarantine`, `refund`, and `store credit`.

## 13. Implementation priority for the current repository

| Priority | Work item | Reason |
|---|---|---|
| P0 | Replace the current product/inventory structure with canonical variants, global attributes, inventory units, balances, movements, and warranty policies. | All later barcode, POS, and returns features depend on stable identity. |
| P0 | Implement a transactional `POST /api/sales/commit` command with idempotency. | Prevent duplicate sales, overselling, and inconsistent payment/inventory records. |
| P0 | Add barcode/IMEI/serial lookup APIs and local POS catalog caching. | Enables scan-first speed. |
| P0 | Add invoice number, sale number, verification token, barcode/QR generation, and immutable invoice snapshots. | Enables business verification and reprints. |
| P0 | Add payment, paid, due, change, discount, VAT, and register-session handling. | Required to complete POS sales correctly. |
| P1 | Add A5 invoice PDF/print template and product label template. | Required for daily operations. |
| P1 | Add print bridge abstraction with browser-dialog fallback. | Enables silent printing without coupling the domain to hardware. |
| P1 | Add online payment confirmation, stock deduction, invoice generation, and SMS outbox. | Required for storefront sales. |
| P1 | Implement functional returns/warranty page and settings-driven policy snapshots. | Essential after-sale workflow. |
| P1 | Add sales-history table, details modal, invoice download, and verification action. | Required management and customer-service workflow. |
| P2 | Add dashboard POS/storefront/cash metrics from committed sales and register data. | Required reporting after core transaction integrity is complete. |
| P2 | Add label-printer device profiles and optional Tauri shell if browser/bridge testing proves insufficient. | Hardware optimization after the core system is reliable. |
| Deferred | Procurement page and advanced procurement automation. | Explicitly excluded from the current release. |

## 14. Final architecture decision for these requirements

The system should remain a **PWA-first modular monolith with a PostgreSQL source of truth**, but the POS must use a **local indexed catalog and a scanner-first interaction model**. A wired USB keyboard-HID barcode scanner is the safest and fastest first hardware choice for a PWA. A local print bridge or Tauri shell is required for reliable silent printing; `window.print()` remains the fallback manual-print path, not the primary silent-print mechanism.

The most important design rule is that the **serialized inventory unit, sale, invoice, payment, warranty, barcode, and audit history are one connected chain**. A mobile phone’s IMEI, a laptop’s serial number, or a drone’s serial number must lead to the exact stock unit, its current status, its warranty entitlement, its invoice, its customer, its payment record, and any return or warranty case. The same chain must work whether the sale originated in the POS or from a successful storefront payment.

## 15. Decisions still requiring client confirmation

Before implementation, confirm the following details:

| Decision | Required confirmation |
|---|---|
| IMEI handling | Whether dual-SIM devices require IMEI 1 and IMEI 2, and whether IMEI validation must use a specific external service. |
| Serial rules | Which device categories require serial tracking and whether serial uniqueness is global or manufacturer-scoped. |
| Barcode standard | Whether business-generated Code 128 is acceptable for labels and whether invoices require QR, Code 128, or both. |
| Invoice verification | What information may be publicly revealed when a customer scans the invoice barcode. |
| Currency and VAT | Currency, VAT-inclusive/exclusive pricing, tax rates, invoice numbering, and local compliance rules. |
| Due sales | Whether due/credit sales are allowed, who approves them, and how balances are collected. |
| Payment confirmation | Gateway provider and exact success/webhook behavior. |
| SMS provider | Provider, sender identity, message template, and retry policy. |
| Printing | Exact laser printer, label printer, paper size, label size, operating systems, and workstation layout. |
| Silent printing | Whether installation of a local print bridge or Tauri desktop shell is acceptable. |
| Warranty | Default periods and different rules for used/pre-owned, official/new, and accessories. |
| Returns | Return windows, refund rules, exchange rules, warranty exclusions, and approval roles. |
| Cash in hand | Exact formula including opening cash, sales, change, cash drops, expenses, refunds, and payouts. |
| Online stock | Whether online sales can reserve store stock and how the last serialized unit is allocated. |
