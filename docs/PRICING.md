# Axiom Tech pricing and plan features (proposal, revised 2026-10-10)

Prices in BDT. Plans are cumulative: Growth = Starter + extras, Pro = Growth + extras.
Status: limits and fees approved by Nur 2026-10-10; feature split still to confirm. Feature flags map to `feature_settings` keys in apps/store.

| | Starter 1,000/mo | Growth 2,000/mo | Pro 3,000/mo |
|---|---|---|---|
| Catalog: brands, categories, specs, variants (`products`) | yes | yes | yes |
| Serialized stock with IMEI/serial tracking (`inventory`) | yes, 1 warehouse | yes | yes |
| Barcode labels, default size (`barcodes`) | yes | yes | yes |
| POS, scan-first, one payment per sale (`pos`) | yes | yes | yes |
| Receipt: logo, header/footer, A5 print/PDF (`settings`) | yes | yes | yes |
| Customers directory (`customers`) | yes | yes | yes |
| Reports: POS sales, inventory (`reports`) | basic | full (8 tabs, profit/loss, staff performance, CSV/PDF) | full + analytics |
| Suppliers, purchase orders, stock receiving (`suppliers`, `purchases`) | - | yes | yes |
| Barcode customization: sizes, content toggles | - | yes | yes |
| POS split payment (multi-method), discounts, VAT breakdown | - | yes | yes |
| Receipt customization: terms, copies, tax breakdown | - | yes | yes |
| Returns and refunds (`returns`), device exchanges/trade-in (`exchanges`) | - | yes | yes |
| Loyalty points, cash register/drawer (`cash`) | - | yes | yes |
| Multi-warehouse and transfers (`warehouses`, `transfers`) | 1 warehouse | up to 2 | unlimited |
| Advanced inventory: category types (pre-owned, official new FIFO, unofficial new, accessories), batch costing, condition codes | - | - | yes |
| Warranty policies and claims (`warranty`) | terms on receipt | terms on receipt | full claims workflow |
| Expense management: petty cash, budgets, recurring, approvals, cash flow | - | - | yes |
| Staff, HR, leave, payroll (`hr`, `leave`, `payroll`) | - | - | yes |
| Audit log, campaigns, hardware/signage | - | - | yes |
| Online storefront and customer portal | - | - | yes (or paid add-on) |
| Staff seats (approved; owner not counted, confirm) | 1 | 2 | unlimited |

## Money
- Monthly: Starter 1,000 / Growth 2,000 / Pro 3,000.
- Sign-up fee (one-time, per plan, approved): 5,000 / 10,000 / 15,000.
- Due at activation (fee + first month): Starter 6,000, Growth 12,000, Pro 18,000.
- Annual prepay (proposal): 10 months for 12 -> 10,000 / 20,000 / 30,000.
- Trial (proposal): 7 days with all Pro features; plan chosen at activation.

## Open
- Confirm storefront placement, trial feature level, whether the owner counts as a seat.
- Verify POS UI supports several payments per sale (schema `sale_payments` already stores many rows).
