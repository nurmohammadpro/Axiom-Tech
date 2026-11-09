# ERP-Level Expense Management System — Implementation Plan

## Overview

Build a comprehensive expense management system combining the proven patterns from MotoCore with ERP-level enhancements. The system handles both direct expenses and petty cash workflows, with multi-currency support for imports, tax-deductible tracking, approval workflows, and full audit trails.

**Business Context (Bangladesh):**
- Currency: BDT (Taka) — stored as integer poisha (×100)
- Payment methods: Cash, bKash, Nagad, Rocket, Bank Transfer, Cheque
- VAT: 15% standard rate, input VAT recovery tracking
- TDS: Various rates (5%, 10%, 15%) depending on expense type

---

## What We're Taking from MotoCore

### Core Patterns (Directly Adopted)

1. **Dual Expense Entry Modes**
   - Quick single-expense dialog (category select → amount → save)
   - Multi-item daily expense form (multiple line items in one submission)

2. **Predefined Expense Heads with Icons**
   - Visual cards showing rent (🏢), electricity (⚡), internet (🌐), gas (🔥), etc.
   - Progress bars showing % of total monthly spend
   - Highest expense highlight card

3. **Recurring Expense Templates**
   - Frequency: daily, weekly, bi-weekly, monthly, quarterly, semi-annual, annual
   - Annual escalation (percentage or fixed increase)
   - Auto-approval limits
   - Cost center assignment
   - Day-of-month / day-of-week scheduling

4. **Scheduled Expense Instances**
   - Auto-generated from templates
   - Status tracking: pending → paid / overdue / skipped / cancelled
   - Mark-as-paid with payment details

5. **12-Month Cash Flow Projections**
   - Projected income vs expenses
   - Opening/closing balance per month
   - Cash position indicators (healthy / low / critical)

6. **Expense Analytics**
   - Monthly breakdown by category with progress bars
   - Period comparison (month-over-month, quarterly, yearly)
   - Trend analysis

7. **CSV Export with Date Range**

8. **Simple API Pattern**
   - `requireAuth()` + `requirePermission()` middleware
   - Zod validation schemas
   - Consistent response helpers

---

## What We're Adding (Our Enhancements)

### 1. Petty Cash Management

MotoCore has no petty cash system. We add:

**`pettyCash` table:**
- Fund name, location, custodian (staff member)
- Opening balance, current balance, low-threshold alert
- Status (active / closed)

**`pettyCashTransactions` table:**
- Type: withdrawal | replenishment | expense
- Amount (positive = in, negative = out)
- Balance after each transaction
- Link to expense record if applicable

**Workflow:**
- Staff withdraws from petty cash → creates transaction + expense
- Replenish fund from bank/cash register
- End-of-day reconciliation

### 2. Budget Management

**`budgets` table:**
- Category + location + period (monthly/quarterly/yearly)
- Allocated amount vs spent amount
- Auto-computed utilization percentage

**Budget Alerts:**
- Warning at 80% utilization
- Over-budget alerts at 100%

### 3. Tax & Compliance Tracking

**Enhanced expense fields:**
- `tax_deductible` boolean per category
- `tds_rate` per category (basis points)
- `vat_applicable` boolean per category
- `vat_amount` and `tds_amount` per expense
- Tax report generation (quarterly/annual)

### 4. Multi-Currency for Imports

- Currency selector (BDT default, USD/EUR/GBP/CNY)
- Exchange rate storage
- Original amount in source currency
- Auto-converted BDT total

### 5. Receipt/Attachment Management

- Upload receipt images/PDFs via Cloudinary
- Multiple attachments per expense
- Thumbnail gallery in expense detail

### 6. Approval Workflow

**Amount thresholds (configurable):**
| Amount | Approval |
|--------|----------|
| ≤ ৳5,000 | Auto-approved |
| ৳5,001 - ৳25,000 | Manager |
| ৳25,001 - ৳100,000 | Owner |
| > ৳100,000 | Owner + optional board |

### 7. Bangladesh-Specific Payment Methods

- bKash, Nagad, Rocket (mobile financial services)
- Bank Transfer, Cheque, Cash
- Payment reference tracking (transaction IDs, cheque numbers)

---

## Database Schema

### 1. `expenseCategories` table

```sql
CREATE TABLE expense_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  parent_id INT REFERENCES expense_categories(id),
  description TEXT,
  
  -- Display
  icon TEXT,                          -- Emoji icon for UI
  color TEXT,                         -- Hex color for UI
  sort_order INT DEFAULT 0,
  
  -- Tax settings
  is_tax_deductible BOOLEAN DEFAULT FALSE,
  tds_rate INT DEFAULT 0,            -- Basis points (1000 = 10%)
  vat_applicable BOOLEAN DEFAULT FALSE,
  
  -- Budget defaults
  default_budget_amount INT,
  budget_alert_threshold DECIMAL(5,2) DEFAULT 80.00,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Pre-seeded categories (MotoCore pattern + Bangladesh enhancements):**

| Code | Name | Icon | Tax Deductible | VAT |
|------|------|------|----------------|-----|
| RENT | Office Rent | 🏢 | Yes | Yes |
| UTIL-ELEC | Electricity | ⚡ | Yes | Yes |
| UTIL-GAS | Gas | 🔥 | Yes | Yes |
| UTIL-WATER | Water | 💧 | Yes | Yes |
| UTIL-INT | Internet | 🌐 | Yes | Yes |
| UTIL-NET | Mobile Data | 📱 | Yes | No |
| TRANSPORT | Transport | 🚗 | Yes | No |
| FUEL | Fuel & Vehicle | ⛽ | Yes | Yes |
| SALARY | Staff Salaries | 👥 | Yes | No |
| BONUS | Bonuses | 🎁 | Yes | No |
| MARKETING | Marketing | 📣 | Yes | No |
| REPAIR | Repair & Maintenance | 🔧 | Yes | Yes |
| OFFICE | Office Supplies | 📝 | Yes | Yes |
| PACKAGING | Packaging | 📦 | Yes | Yes |
| INSURANCE | Insurance | 🛡️ | Yes | No |
| PROFESSIONAL | Professional Services | 👔 | Yes | No |
| TRAVEL | Travel | ✈️ | Yes | Yes |
| TRAINING | Training | 📚 | Yes | No |
| EQUIPMENT | Equipment | 🖥️ | Yes | Yes |
| SOFTWARE | Software | 💻 | Yes | No |
| ENTERTAINMENT | Entertainment | 🎬 | No | No |
| COURIER | Courier | 📮 | Yes | No |
| DONATION | Donation | 🎀 | No | No |
| CUSTOM | Custom | 📋 | Varies | Varies |
| MISC | Miscellaneous | ❓ | Yes | No |
```

### 2. `expenses` table (Core — enhanced from MotoCore)

```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Expense number (auto-generated: EXP-YYMMDD-NNNN)
  expense_number VARCHAR(50) UNIQUE NOT NULL,
  
  -- Category
  category_id INT REFERENCES expense_categories(id),
  
  -- Basic info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Amount breakdown
  amount INT NOT NULL,                  -- Base amount in poisha
  vat_amount INT DEFAULT 0,            -- Input VAT claimed
  tds_amount INT DEFAULT 0,            -- TDS deducted
  total_amount INT NOT NULL,           -- amount + vat - tds
  
  -- Currency (for import expenses)
  currency TEXT DEFAULT 'BDT',
  exchange_rate INT DEFAULT 100,       -- Rate to BDT (×100)
  original_amount INT,                 -- Amount in source currency
  original_currency TEXT,
  
  -- Date
  expense_date DATE DEFAULT CURRENT_DATE,
  
  -- Payment
  payment_method TEXT DEFAULT 'cash',  -- cash | bkash | nagad | rocket | bank_transfer | cheque
  payment_reference TEXT,              -- Transaction ID, cheque number
  payment_status TEXT DEFAULT 'paid',  -- pending | paid | partial | cancelled
  
  -- Payee/Vendor
  payee_name TEXT,
  payee_type TEXT,                     -- vendor | employee | utility | government | other
  vendor_invoice_number TEXT,
  vendor_invoice_date DATE,
  
  -- Approval
  status TEXT DEFAULT 'approved',      -- pending | approved | rejected | cancelled
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,
  
  -- Reimbursement
  is_reimbursable BOOLEAN DEFAULT FALSE,
  reimbursed_amount INT DEFAULT 0,
  reimbursed_to UUID REFERENCES users(id),
  reimbursed_at TIMESTAMPTZ,
  
  -- Location/store
  location_id TEXT,
  
  -- Recurring link
  recurring_template_id UUID,
  
  -- Budget tracking
  budget_category TEXT,
  
  -- Attachments
  receipt_url TEXT,
  invoice_url TEXT,
  attachment_urls TEXT[],
  
  -- Audit
  created_by UUID REFERENCES users(id),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. `dailyExpenses` + `dailyExpenseItems` tables (MotoCore pattern)

```sql
CREATE TABLE daily_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number VARCHAR(50) UNIQUE NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total INT NOT NULL DEFAULT 0,
  payment_method VARCHAR(50) DEFAULT 'cash',
  status VARCHAR(20) DEFAULT 'paid',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  location_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE daily_expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_expense_id UUID NOT NULL REFERENCES daily_expenses(id) ON DELETE CASCADE,
  head VARCHAR(50) NOT NULL,          -- rent, electricity, internet, gas, etc.
  custom_head VARCHAR(255),           -- When head = 'custom'
  amount INT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. `expenseApprovals` table

```sql
CREATE TABLE expense_approvals (
  id SERIAL PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES users(id),
  level INT NOT NULL,                  -- 1 = manager, 2 = owner
  status TEXT DEFAULT 'pending',       -- pending | approved | rejected
  notes TEXT,
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. `expenseAttachments` table

```sql
CREATE TABLE expense_attachments (
  id SERIAL PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6. `pettyCash` table

```sql
CREATE TABLE petty_cash (
  id SERIAL PRIMARY KEY,
  fund_name TEXT NOT NULL DEFAULT 'Petty Cash',
  location_id TEXT,
  custodian_id UUID REFERENCES users(id),
  opening_balance INT NOT NULL DEFAULT 0,
  current_balance INT NOT NULL DEFAULT 0,
  low_threshold INT DEFAULT 500000,    -- Alert when below ৳5,000
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7. `pettyCashTransactions` table

```sql
CREATE TABLE petty_cash_transactions (
  id SERIAL PRIMARY KEY,
  petty_cash_id INT NOT NULL REFERENCES petty_cash(id),
  type TEXT NOT NULL,                  -- withdrawal | replenishment | expense
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  description TEXT NOT NULL,
  expense_id UUID REFERENCES expenses(id),
  reference_number TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 8. `recurringExpenseTemplates` table (MotoCore pattern)

```sql
CREATE TABLE recurring_expense_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Category
  category_id INT REFERENCES expense_categories(id),
  
  -- Amount
  amount INT NOT NULL,
  currency TEXT DEFAULT 'BDT',
  
  -- Frequency
  frequency VARCHAR(20) NOT NULL,      -- daily | weekly | bi_weekly | monthly | quarterly | semi_annual | annual
  
  -- Schedule
  start_date DATE NOT NULL,
  end_date DATE,
  day_of_month INT,
  day_of_week VARCHAR(10),
  
  -- Payment
  payment_method VARCHAR(50),
  payee_name VARCHAR(255),
  
  -- Escalation (annual increase)
  escalation_type TEXT DEFAULT 'none', -- none | percentage | fixed
  escalation_rate INT DEFAULT 0,
  
  -- Approval
  require_approval BOOLEAN DEFAULT TRUE,
  approval_limit INT DEFAULT 0,        -- Auto-approve below this
  
  -- Assignment
  assigned_to UUID REFERENCES users(id),
  cost_center TEXT,
  
  -- Alerts
  alert_days_before INT DEFAULT 3,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'active',
  
  -- Audit
  created_by UUID REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 9. `scheduledExpenses` table (MotoCore pattern)

```sql
CREATE TABLE scheduled_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES recurring_expense_templates(id),
  
  -- Info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id INT REFERENCES expense_categories(id),
  
  -- Amount
  amount INT NOT NULL,
  actual_amount INT,
  
  -- Due
  due_date DATE NOT NULL,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- Payment
  paid_date DATE,
  paid_amount INT,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(100),
  
  -- Approval
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  
  -- Attachments
  receipt_url TEXT,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 10. `budgets` table

```sql
CREATE TABLE budgets (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES expense_categories(id),
  location_id TEXT,
  period_type TEXT NOT NULL,           -- monthly | quarterly | yearly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  allocated_amount INT NOT NULL,
  spent_amount INT DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, location_id, period_type, period_start)
);
```

### 11. `cashFlowProjections` table (MotoCore pattern)

```sql
CREATE TABLE cash_flow_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT,
  
  projection_month DATE NOT NULL,
  month_number INT NOT NULL,
  
  -- Projections
  projected_income INT DEFAULT 0,
  projected_expenses INT DEFAULT 0,
  projected_net_cashflow INT GENERATED ALWAYS AS (projected_income - projected_expenses) STORED,
  
  -- Actuals
  actual_income INT DEFAULT 0,
  actual_expenses INT DEFAULT 0,
  actual_net_cashflow INT GENERATED ALWAYS AS (actual_income - actual_expenses) STORED,
  
  -- Breakdown
  income_breakdown JSONB DEFAULT '{}',
  expense_breakdown JSONB DEFAULT '{}',
  
  -- Balance
  opening_balance INT DEFAULT 0,
  closing_balance INT GENERATED ALWAYS AS (opening_balance + actual_net_cashflow) STORED,
  
  -- Status
  is_actual BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(location_id, projection_month)
);
```

---

## API Routes

### Expenses

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/expenses` | List expenses with filters |
| POST | `/api/dashboard/expenses` | Create expense (single) |
| GET | `/api/dashboard/expenses/[id]` | Get expense detail |
| PUT | `/api/dashboard/expenses/[id]` | Update expense |
| DELETE | `/api/dashboard/expenses/[id]` | Delete expense |
| POST | `/api/dashboard/expenses/[id]/submit` | Submit for approval |
| POST | `/api/dashboard/expenses/[id]/approve` | Approve expense |
| POST | `/api/dashboard/expenses/[id]/reject` | Reject expense |

### Daily Expenses (Multi-item)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/expenses/daily` | List daily expense records |
| POST | `/api/dashboard/expenses/daily` | Create daily expense (multi-item) |

### Expense Categories

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/expenses/categories` | List categories |
| POST | `/api/dashboard/expenses/categories` | Create category |
| PUT | `/api/dashboard/expenses/categories/[id]` | Update category |

### Petty Cash

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/expenses/petty-cash` | List funds |
| POST | `/api/dashboard/expenses/petty-cash` | Create fund |
| GET | `/api/dashboard/expenses/petty-cash/[id]` | Fund detail + transactions |
| POST | `/api/dashboard/expenses/petty-cash/[id]/withdraw` | Withdraw |
| POST | `/api/dashboard/expenses/petty-cash/[id]/replenish` | Replenish |

### Budgets

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/expenses/budgets` | List budgets |
| POST | `/api/dashboard/expenses/budgets` | Create budget |
| PUT | `/api/dashboard/expenses/budgets/[id]` | Update budget |

### Recurring Expenses

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/expenses/recurring` | List templates |
| POST | `/api/dashboard/expenses/recurring` | Create template |
| PUT | `/api/dashboard/expenses/recurring/[id]` | Update template |
| GET | `/api/dashboard/expenses/recurring/instances` | List scheduled instances |
| POST | `/api/dashboard/expenses/recurring/instances/[id]/pay` | Mark instance paid |

### Reports & Export

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/expenses/reports/summary` | Expense summary |
| GET | `/api/dashboard/expenses/reports/tax` | Tax report |
| GET | `/api/dashboard/expenses/reports/budget` | Budget utilization |
| GET | `/api/dashboard/expenses/export` | CSV export |

### Cash Flow

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/dashboard/expenses/cashflow` | 12-month projection |
| POST | `/api/dashboard/expenses/cashflow/regenerate` | Regenerate projections |

---

## Frontend Pages

### 1. Expense Dashboard (`/dashboard/expenses`)

**Stat Cards:**
- Total Expenses (this month) with % change
- Pending Approvals (count)
- Petty Cash Balance
- Budget Utilization (%)

**Expense Head Cards (from MotoCore):**
- Grid of cards with icons showing spend by category
- Progress bars showing % of total
- Highest expense highlight

**Charts:**
- Expense by Category (donut)
- Expense Trends (line — 12 months)
- Budget vs Actual (bar)
- Payment Method Split (pie)

**Recent Expenses Table:**
- Date, Number, Category, Title, Amount, Status, Actions

### 2. Expenses List (`/dashboard/expenses/list`)

**Filters:**
- Date Range (preset + custom)
- Category (multi-select)
- Status (pending/approved/rejected/paid/cancelled)
- Location, Payment Method
- Search (title, vendor, invoice #)

**Table Columns:**
- Expense #, Date, Category (with icon), Title, Vendor, Amount, VAT, TDS, Total, Payment Method, Status (Pill), Submitted By, Actions

### 3. Create Expense — Two Modes

**Mode 1: Quick Single Expense (Dialog)**
- Category quick-select dropdown
- Expense name (auto-filled from category)
- Amount
- Date
- Payment method
- Notes
- Save button

**Mode 2: Daily Multi-Item Expense (Full Page)**
- Date selection
- Add multiple line items
  - Expense head (predefined dropdown with icons)
  - Custom head name (when "Custom" selected)
  - Amount
  - Description
- Total calculation
- Notes
- Save button

### 4. Expense Detail (`/dashboard/expenses/[id]`)

- Header with amount and status badge
- Info cards (basic info, amount breakdown, payment, vendor)
- Approval timeline
- Receipt/attachments gallery
- Audit trail

### 5. Petty Cash (`/dashboard/expenses/petty-cash`)

- Fund cards with balances
- Quick actions (withdraw, replenish)
- Transaction history table
- Low balance warnings

### 6. Budgets (`/dashboard/expenses/budgets`)

- Overview cards (total budget, spent, remaining, %)
- Budget table with progress bars
- Create/edit budget form

### 7. Recurring Expenses (`/dashboard/expenses/recurring`)

- Template list with status
- Create/edit form with:
  - Basic info
  - Schedule (frequency, day of month/week)
  - Escalation settings
  - Approval & assignment
- Instance list (upcoming, paid, overdue)

### 8. Reports (`/dashboard/expenses/reports`)

- Summary report
- Tax report
- Budget utilization
- Period comparison
- Export options (CSV, PDF)

### 9. Cash Flow (`/dashboard/expenses/cashflow`)

- 12-month projection chart
- Monthly breakdown table
- Cash position indicators

---

## Sidebar Navigation

```typescript
{
  title: "Expenses",
  items: [
    { to: "/dashboard/expenses", label: "Overview", icon: Receipt, featureKey: "expenses" },
    { to: "/dashboard/expenses/list", label: "All Expenses", icon: FileText, featureKey: "expenses" },
    { to: "/dashboard/expenses/petty-cash", label: "Petty Cash", icon: Banknote, featureKey: "petty_cash" },
    { to: "/dashboard/expenses/budgets", label: "Budgets", icon: PieChart, featureKey: "budgets" },
    { to: "/dashboard/expenses/recurring", label: "Recurring", icon: Repeat, featureKey: "recurring_expenses" },
    { to: "/dashboard/expenses/reports", label: "Reports", icon: BarChart3, featureKey: "expense_reports" },
    { to: "/dashboard/expenses/cashflow", label: "Cash Flow", icon: TrendingUp, featureKey: "cash_flow" },
  ],
},
```

---

## Feature Keys & RBAC

```typescript
// Add to FeatureKey union
| "expenses" | "petty_cash" | "budgets" | "recurring_expenses" | "expense_reports" | "cash_flow" | "expense_approvals"
```

| Feature | Owner | Manager | Salesman |
|---------|-------|---------|----------|
| View Expenses | ✅ | ✅ | ❌ |
| Create Expenses | ✅ | ✅ | ✅ (own only) |
| Approve ≤৳25,000 | ✅ | ✅ | ❌ |
| Approve >৳25,000 | ✅ | ❌ | ❌ |
| Petty Cash | ✅ | ✅ | ❌ |
| Budgets | ✅ | ❌ | ❌ |
| Recurring | ✅ | ✅ | ❌ |
| Reports | ✅ | ✅ | ❌ |
| Cash Flow | ✅ | ❌ | ❌ |

---

## Implementation Order

### Phase 1: Schema + Categories (Week 1)
1. Add all tables to `src/db/schema.ts`
2. Run `db:push`
3. Seed expense categories
4. Create `src/lib/expense-utils.ts`

### Phase 2: Core Expenses (Week 2-3)
5. Expense API routes (CRUD)
6. Daily expense API (multi-item)
7. Expense list page
8. Quick add dialog
9. Daily expense form page
10. Expense detail page

### Phase 3: Categories + Approval (Week 4)
11. Category API routes
12. Category management UI
13. Approval workflow API
14. Approval UI components

### Phase 4: Petty Cash (Week 5)
15. Petty cash tables + API
16. Petty cash page
17. Integration with expense recording

### Phase 5: Recurring Expenses (Week 6)
18. Recurring template API
19. Scheduled instances API
20. Recurring expense pages
21. Instance management

### Phase 6: Budgets (Week 7)
22. Budget API routes
23. Budget page
24. Budget alerts

### Phase 7: Reports & Cash Flow (Week 8)
25. Summary/tax/budget reports
26. Cash flow projections
27. CSV export
28. Report pages

### Phase 8: Polish (Week 9)
29. RBAC enforcement
30. Audit logging
31. Mobile responsiveness
32. Testing

---

## Testing Strategy

- Unit: expense number generation, total calculation, currency conversion
- Integration: CRUD operations, approval workflow, petty cash balance
- E2E: Create expense → approve → pay, petty cash withdrawal, budget alert

---

## Success Criteria

- [ ] Both single and multi-item expense entry working
- [ ] Expense head cards showing correct totals
- [ ] Approval workflow for all thresholds
- [ ] Petty cash tracking with real-time balance
- [ ] Recurring expenses generating instances
- [ ] Budget alerts at 80% utilization
- [ ] Tax-deductible expenses properly tagged
- [ ] CSV export working
- [ ] Cash flow projections accurate
- [ ] Mobile-friendly experience
