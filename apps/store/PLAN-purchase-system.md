# Purchase & Supplier Management System — Implementation Plan

## Overview

Build a complete procurement system with supplier management, purchase orders, and accounts payable ledger. The system supports multiple supplier types including customers who sell pre-owned devices.

---

## 1. Database Schema Changes

### 1.1 `suppliers` table (NEW)

```sql
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'company',  -- 'company' | 'importer' | 'individual' | 'customer'
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  opening_balance INTEGER DEFAULT 0,     -- opening payable (owed to supplier)
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Supplier types:**
- `company` — Regular supplier company (e.g., Samsung distributor)
- `importer` — Importer/distributor who brings devices from abroad
- `individual` — Individual seller (one-off transactions)
- `customer` — Existing customer selling pre-owned devices (linked to users table optionally)

### 1.2 Alter `purchase_orders` table

```sql
ALTER TABLE purchase_orders
  ADD COLUMN supplier_id UUID REFERENCES suppliers(id),
  ADD COLUMN expected_date DATE,
  ADD COLUMN payment_status TEXT DEFAULT 'unpaid',  -- 'unpaid' | 'partial' | 'paid'
  ADD COLUMN paid_amount INTEGER DEFAULT 0,
  ADD COLUMN due_date DATE;
```

- `supplier_id` — FK to suppliers (replaces the free-text `supplier` field)
- `payment_status` — Tracks payment state
- `paid_amount` — How much has been paid so far
- `due_date` — Payment due date

### 1.3 `supplier_payments` table (NEW — Supplier Ledger)

```sql
CREATE TABLE supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),  -- nullable for opening balance
  amount INTEGER NOT NULL,              -- positive = payment to supplier, negative = credit note
  payment_method TEXT NOT NULL DEFAULT 'cash',  -- 'cash' | 'bank_transfer' | 'cheque' | 'bkash' | 'nagad'
  reference TEXT,                        -- cheque number, transaction ID, etc.
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.4 `supplier_balances` view (computed)

```sql
CREATE VIEW supplier_balances AS
SELECT
  s.id AS supplier_id,
  s.name AS supplier_name,
  COALESCE(SUM(po.total), 0) AS total_purchases,
  COALESCE(sp.total_paid, 0) AS total_paid,
  COALESCE(SUM(po.total), 0) - COALESCE(sp.total_paid, 0) AS outstanding_balance
FROM suppliers s
LEFT JOIN purchase_orders po ON po.supplier_id = s.id AND po.status != 'cancelled'
LEFT JOIN (
  SELECT supplier_id, SUM(amount) AS total_paid
  FROM supplier_payments
  GROUP BY supplier_id
) sp ON sp.supplier_id = s.id
GROUP BY s.id, s.name, sp.total_paid;
```

---

## 2. API Routes

### 2.1 Suppliers CRUD

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/suppliers` | List all suppliers (with balance) |
| POST | `/api/dashboard/suppliers` | Create new supplier |
| GET | `/api/dashboard/suppliers/[id]` | Get supplier detail + ledger |
| PATCH | `/api/dashboard/suppliers/[id]` | Update supplier |
| DELETE | `/api/dashboard/suppliers/[id]` | Soft-delete (set is_active=false) |

### 2.2 Supplier Payments / Ledger

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/suppliers/[id]/payments` | Payment history for a supplier |
| POST | `/api/dashboard/suppliers/[id]/payments` | Record a payment to supplier |

### 2.3 Purchase Orders (enhance existing)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/procurement` | List POs (enhance with items, supplier data) |
| POST | `/api/dashboard/procurement` | Create PO (enhance with supplier_id, items) |
| GET | `/api/dashboard/procurement/[id]` | Get PO detail with items |
| PATCH | `/api/dashboard/procurement/[id]` | Update PO status, mark received |
| POST | `/api/dashboard/procurement/[id]/receive` | Receive items into inventory |

---

## 3. Frontend Pages

### 3.1 Suppliers Page (`/dashboard/suppliers`)

**Layout:**
- Stat cards: Total Suppliers, Total Payable, This Month Purchases, Active Suppliers
- Filters: type (company/importer/individual/customer), search
- Table: Name, Type, Contact, Phone, Total Purchases, Outstanding Balance, Actions
- "Add Supplier" button → modal/inline form

**Supplier Form Fields:**
- Name (required)
- Type (dropdown: company/importer/individual/customer)
- Contact Person
- Email
- Phone
- Address
- City
- Opening Balance (for migration from old system)
- Notes

### 3.2 Supplier Detail Page (`/dashboard/suppliers/[id]`)

**Layout:**
- Supplier info card (name, type, contact details)
- Balance summary: Total Purchased, Total Paid, Outstanding Balance
- "Record Payment" button → payment form
- Tabs: Purchase History | Payment Ledger | Outstanding POs

**Payment Form:**
- Amount
- Payment Method (cash/bank_transfer/cheque/bkash/nagad)
- Reference Number (optional)
- Notes
- Allocate to PO (optional — can be general payment)

### 3.3 Purchase Order Page (`/dashboard/procurement` — rewrite)

**Layout:**
- Stat cards: Open POs, Pending Payment, Received This Month, Total Value
- Filters: status (pending/partial/received/cancelled), supplier, date range
- Table: PO#, Supplier, Items Count, Total, Paid, Status, Expected Date, Actions
- "Create Purchase Order" button

### 3.4 Create Purchase Order (`/dashboard/procurement/create`)

**Form:**
- Supplier (searchable dropdown from suppliers list)
- Expected Delivery Date
- Notes
- Line items:
  - Product (searchable — from existing catalog, or add new)
  - Quantity
  - Unit Cost (৳)
  - Line Total (auto-calculated)
- Add Item button
- Subtotal / Total (auto-calculated)
- Save as Draft / Save & Send

### 3.5 Purchase Order Detail (`/dashboard/procurement/[id]`)

**Layout:**
- PO header: PO#, Supplier, Date, Status badge
- Items table with received quantities
- "Receive Items" button → opens receive flow (integrates with existing `/api/inventory/receive`)
- Payment section: Amount Due, Payment History, "Record Payment" button
- Status workflow: Draft → Ordered → Partial → Received → Paid

---

## 4. Sidebar Navigation Update

Add to `dashboard-shell.tsx` groups:

```typescript
{
  title: "Purchases",
  items: [
    { to: "/dashboard/suppliers", label: "Suppliers", icon: Users },
    { to: "/dashboard/procurement", label: "Purchase Orders", icon: Truck },
  ],
}
```

For **salesman** role: hide this group entirely.
For **manager** role: show but without supplier management (PO viewing only).
For **owner** role: full access.

---

## 5. RBAC Rules

| Feature | Owner | Manager | Salesman |
|---------|-------|---------|----------|
| View Suppliers | ✅ | ✅ | ❌ |
| Add/Edit/Delete Suppliers | ✅ | ❌ | ❌ |
| View Purchase Orders | ✅ | ✅ | ❌ |
| Create Purchase Orders | ✅ | ❌ | ❌ |
| Receive Items | ✅ | ❌ | ❌ |
| Record Payments | ✅ | ❌ | ❌ |
| View Supplier Ledger | ✅ | ✅ (read-only) | ❌ |

---

## 6. Implementation Order

### Phase 1: Supplier Management
1. Create `suppliers` table migration
2. Build suppliers API routes (CRUD)
3. Build suppliers page with table + add/edit modal
4. Build supplier detail page with ledger

### Phase 2: Purchase Orders
5. Alter `purchase_orders` table (add supplier_id, payment fields)
6. Create `supplier_payments` table
7. Enhance procurement API routes
8. Build PO creation form
9. Build PO detail page
10. Integrate receive flow with PO items

### Phase 3: Payments & Ledger
11. Build payment recording API
12. Build supplier ledger view
13. Add payment allocation to POs
14. Dashboard stats for payables

### Phase 4: Polish
15. Add procurement to sidebar nav
16. RBAC enforcement
17. Search and filters
18. Print PO / Payment receipt

---

## 7. Key Design Decisions

1. **Customer as Supplier**: When a customer sells a pre-owned device, we create them as a supplier with type `customer`. The payment can be in the form of cash payout or store credit.

2. **Opening Balance**: Allows migrating existing supplier debts from an old system.

3. **Payment Allocation**: Payments can be general (reduce overall balance) or allocated to specific POs.

4. **Linked to Existing Receive**: The PO receive flow will call the existing `/api/inventory/receive` endpoint, passing the PO item reference for tracking.

5. **No Approval Workflow (v1)**: Keep it simple — owner creates and manages POs directly.
