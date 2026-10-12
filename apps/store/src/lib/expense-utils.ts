// Amount Calculations
// ---------------------------------------------------------------------------

/**
 * Calculate expense totals with VAT and TDS.
 * All amounts in poisha (BDT × 100).
 */
export function calculateExpenseTotals(
  amount: number,
  vatRate: number = 0,
  tdsRate: number = 0,
): {
  vatAmount: number;
  tdsAmount: number;
  totalAmount: number;
} {
  const vatAmount = Math.round((amount * vatRate) / 100);
  const tdsAmount = Math.round((amount * tdsRate) / 100);
  const totalAmount = amount + vatAmount - tdsAmount;
  return { vatAmount, tdsAmount, totalAmount };
}

/**
 * Convert foreign currency to BDT.
 * exchangeRate is stored as rate × 100 (e.g., 110.50 = 11050).
 */
export function convertToBDT(amount: number, fromCurrency: string, exchangeRate: number): number {
  if (fromCurrency === "BDT") return amount;
  return Math.round((amount * exchangeRate) / 100);
}

// ---------------------------------------------------------------------------
// Expense Status Helpers
// ---------------------------------------------------------------------------

export type ExpenseStatus = "pending" | "approved" | "rejected" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "partial" | "cancelled";

export function getStatusColor(status: string): "success" | "warn" | "danger" | "info" | "muted" {
  switch (status) {
    case "approved":
    case "paid":
      return "success";
    case "pending":
      return "warn";
    case "rejected":
    case "cancelled":
      return "danger";
    case "partial":
      return "info";
    default:
      return "muted";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "pending":
      return "Pending";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Payment Method Helpers
// ---------------------------------------------------------------------------

export type PaymentMethod = "cash" | "bkash" | "nagad" | "rocket" | "bank_transfer" | "cheque";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "rocket", label: "Rocket" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];

export function getPaymentMethodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

// ---------------------------------------------------------------------------
// Expense Head Labels (for daily expenses)
// ---------------------------------------------------------------------------

export const EXPENSE_HEADS = [
  { value: "rent", label: "Rent", icon: "🏢", color: "bg-blue-500" },
  { value: "electricity", label: "Electricity Bill", icon: "⚡", color: "bg-yellow-500" },
  { value: "internet", label: "Internet Bill", icon: "🌐", color: "bg-purple-500" },
  { value: "gas", label: "Gas Bill", icon: "🔥", color: "bg-orange-500" },
  { value: "entertainment", label: "Entertainment", icon: "🎬", color: "bg-pink-500" },
  { value: "repair", label: "Repair & Maintenance", icon: "🔧", color: "bg-red-500" },
  { value: "stationary", label: "Stationary", icon: "📝", color: "bg-green-500" },
  { value: "courier", label: "Courier", icon: "📦", color: "bg-indigo-500" },
  { value: "donation", label: "Donation", icon: "🎁", color: "bg-teal-500" },
  { value: "custom", label: "Custom", icon: "📋", color: "bg-gray-500" },
];

export function getExpenseHeadLabel(head: string): string {
  return EXPENSE_HEADS.find((h) => h.value === head)?.label ?? head;
}

export function getExpenseHeadIcon(head: string): string {
  return EXPENSE_HEADS.find((h) => h.value === head)?.icon ?? "📋";
}

// ---------------------------------------------------------------------------
// Budget Helpers
// ---------------------------------------------------------------------------

export type BudgetStatus = "under" | "warning" | "over";

/**
 * Get budget status based on utilization.
 */
export function getBudgetStatus(allocated: number, spent: number): BudgetStatus {
  if (allocated === 0) return "under";
  const utilization = (spent / allocated) * 100;
  if (utilization >= 100) return "over";
  if (utilization >= 80) return "warning";
  return "under";
}

/**
 * Calculate budget utilization percentage.
 */
export function calculateBudgetUtilization(allocated: number, spent: number): number {
  if (allocated === 0) return 0;
  return Math.round((spent / allocated) * 100);
}

// ---------------------------------------------------------------------------
// Petty Cash Helpers
// ---------------------------------------------------------------------------

/**
 * Check if petty cash balance is below threshold.
 */
export function isLowBalance(balance: number, threshold: number): boolean {
  return balance < threshold;
}

// ---------------------------------------------------------------------------
// Frequency Helpers (for recurring expenses)
// ---------------------------------------------------------------------------

export type RecurringFrequency =
  | "daily"
  | "weekly"
  | "bi_weekly"
  | "monthly"
  | "quarterly"
  | "semi_annual"
  | "annual";

export const RECURRING_FREQUENCIES: {
  value: RecurringFrequency;
  label: string;
  description: string;
}[] = [
  { value: "daily", label: "Daily", description: "Every day" },
  { value: "weekly", label: "Weekly", description: "Every week" },
  { value: "bi_weekly", label: "Bi-weekly", description: "Every 2 weeks" },
  { value: "monthly", label: "Monthly", description: "Every month" },
  { value: "quarterly", label: "Quarterly", description: "Every 3 months" },
  { value: "semi_annual", label: "Semi-annual", description: "Every 6 months" },
  { value: "annual", label: "Annual", description: "Every year" },
];

/**
 * Convert recurring amount to monthly equivalent.
 */
export function convertToMonthly(amount: number, frequency: RecurringFrequency): number {
  switch (frequency) {
    case "daily":
      return amount * 30;
    case "weekly":
      return amount * 4.33;
    case "bi_weekly":
      return amount * 2.17;
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "semi_annual":
      return amount / 6;
    case "annual":
      return amount / 12;
    default:
      return amount;
  }
}

/**
 * Convert recurring amount to annual equivalent.
 */
export function convertToAnnual(amount: number, frequency: RecurringFrequency): number {
  switch (frequency) {
    case "daily":
      return amount * 365;
    case "weekly":
      return amount * 52;
    case "bi_weekly":
      return amount * 26;
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "semi_annual":
      return amount * 2;
    case "annual":
      return amount;
    default:
      return amount * 12;
  }
}

// ---------------------------------------------------------------------------
// Category Helpers
// ---------------------------------------------------------------------------

export interface ExpenseCategory {
  id: number;
  name: string;
  code: string;
  icon: string | null;
  color: string | null;
  isTaxDeductible: boolean | null;
  tdsRate: number | null;
  vatApplicable: boolean | null;
}

// ---------------------------------------------------------------------------
// Recurrence Scheduling
// ---------------------------------------------------------------------------

export interface RecurrenceScheduleInput {
  frequency: RecurringFrequency;
  startDate: Date;
  dayOfMonth?: number | null;
  dayOfWeek?: string | null;
}

/**
 * The first occurrence strictly after `after` for a template's schedule.
 * Returns null when the schedule can't produce a next date (bad input).
 */
export function nextRunDate(s: RecurrenceScheduleInput, after: Date): Date | null {
  const day = 24 * 60 * 60 * 1000;
  const start = new Date(s.startDate);
  start.setHours(9, 0, 0, 0); // deterministic intraday time for generated rows

  const min = new Date(Math.max(after.getTime() + day, start.getTime()));
  min.setHours(9, 0, 0, 0);

  switch (s.frequency) {
    case "daily":
      return min;
    case "weekly":
    case "bi_weekly": {
      if (!s.dayOfWeek) return null;
      const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const target = names.indexOf(s.dayOfWeek.toLowerCase());
      if (target < 0) return null;
      const candidate = new Date(min);
      candidate.setDate(candidate.getDate() + ((target - candidate.getDay() + 7) % 7));
      if (s.frequency === "bi_weekly") {
        // align to the template's week parity so skips stay on alternating weeks
        const anchor = new Date(start);
        anchor.setDate(anchor.getDate() + ((target - anchor.getDay() + 7) % 7));
        const weeksBetween = Math.floor((candidate.getTime() - anchor.getTime()) / (7 * day));
        if (weeksBetween % 2 !== 0) candidate.setDate(candidate.getDate() + 7);
      }
      return candidate;
    }
    case "monthly":
    case "quarterly":
    case "semi_annual": {
      const step = s.frequency === "monthly" ? 1 : s.frequency === "quarterly" ? 3 : 6;
      const dom =
        s.dayOfMonth && s.dayOfMonth >= 1 && s.dayOfMonth <= 31 ? s.dayOfMonth : start.getDate();
      const candidate = new Date(min.getFullYear(), min.getMonth(), 1, 9, 0, 0, 0);
      for (let i = 0; i < step * 2; i++) {
        const probe = new Date(candidate.getFullYear(), candidate.getMonth() + i, 1, 9, 0, 0, 0);
        const lastDay = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
        probe.setDate(Math.min(dom, lastDay));
        if (probe.getTime() >= min.getTime()) return probe;
      }
      return null;
    }
    case "annual": {
      const candidate = new Date(min.getFullYear(), start.getMonth(), 1, 9, 0, 0, 0);
      const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
      candidate.setDate(Math.min(start.getDate(), lastDay));
      if (candidate.getTime() < min.getTime()) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
      return candidate;
    }
    default:
      return null;
  }
}

/**
 * Stable period key for dedupe of generated recurring expenses:
 * `<templateId>:<occurrence-date YYYY-MM-DD>`.
 */
export function recurringPeriodKey(templateId: string, date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${templateId}:${y}-${m}-${d}`;
}
