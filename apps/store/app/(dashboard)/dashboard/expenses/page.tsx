"use client";

import { Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, Stat, Pill } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { SearchSelect } from "@/components/ui/search-select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { bdt } from "@/lib/utils";
import { useSessionScope } from "@/lib/hooks";
import { sessionToken } from "@/lib/api";
import {
  Check,
  Download,
  Eye,
  List,
  Pencil,
  PiggyBank,
  Plus,
  Repeat,
  Trash2,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { NewExpenseTab } from "./_components/new-expense-tab";
import { BudgetsTab } from "./_components/budgets-tab";
import { PettyCashTab } from "./_components/petty-cash-tab";
import { RecurringTab } from "./_components/recurring-tab";
import { EditExpenseDialog, EditableExpense } from "./_components/edit-expense-dialog";
import { ExpenseInsights } from "./_components/insights";
import { TabStrip } from "@/components/dashboard/tab-strip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpenseRow {
  id: number;
  expenseNumber: string;
  categoryId: number | null;
  name: string;
  description: string | null;
  amount: number;
  vatAmount: number;
  tdsAmount: number;
  totalAmount: number;
  expenseDate: string;
  paymentMethod: string;
  paymentReference: string | null;
  paymentStatus: string;
  payeeName: string | null;
  vendorInvoiceNumber: string | null;
  status: string;
  notes: string | null;
  receiptUrl: string | null;
  categoryName: string | null;
  categoryColor: string | null;
}

interface SummaryData {
  monthly: { month: string; total: number }[];
  byCategory: {
    categoryId: number | null;
    name: string | null;
    color: string | null;
    total: number;
  }[];
  byPayee: { payee: string | null; total: number }[];
  vat: number;
  tds: number;
  pendingTotal: number;
  currentMonthTotal: number;
  prevMonthTotal: number;
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

type Tab = "overview" | "new" | "budgets" | "petty" | "recurring";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "overview", label: "Overview", icon: List },
  { key: "new", label: "New Expense", icon: Plus },
  { key: "budgets", label: "Budgets", icon: PiggyBank },
  { key: "petty", label: "Petty Cash", icon: Wallet },
  { key: "recurring", label: "Recurring", icon: Repeat },
];

const STATUS_OPTIONS = ["All", "pending", "approved", "rejected", "cancelled"] as const;

const PAYMENT_METHOD_FILTERS = [
  "All",
  "cash",
  "bkash",
  "nagad",
  "rocket",
  "bank_transfer",
  "card",
  "cheque",
] as const;

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
  bank_transfer: "Bank",
  card: "Card",
  cheque: "Cheque",
};

function statusPill(status: string) {
  const map: Record<string, { label: string; tone: "success" | "warn" | "danger" | "muted" }> = {
    pending: { label: "Pending", tone: "warn" },
    approved: { label: "Approved", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
    cancelled: { label: "Cancelled", tone: "muted" },
  };
  const s = map[status] || { label: status, tone: "muted" as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

function paymentStatusPill(paymentStatus: string) {
  const map: Record<string, "success" | "warn" | "danger" | "muted"> = {
    paid: "success",
    pending: "warn",
    partial: "warn",
    cancelled: "muted",
  };
  const label = paymentStatus[0].toUpperCase() + paymentStatus.slice(1);
  return <Pill tone={map[paymentStatus] || "muted"}>{label}</Pill>;
}

function methodPill(method: string) {
  return (
    <Pill tone="info">
      <span className="flex items-center gap-1">
        <Wallet size={10} />
        {METHOD_LABELS[method] || method}
      </span>
    </Pill>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function ExpensesPage() {
  return (
    <Suspense>
      <ExpensesPageInner />
    </Suspense>
  );
}

function ExpensesPageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "new" ? "new" : "overview";
  const [tab, setTab] = useState<Tab>(initialTab);
  const { data: session } = useSessionScope();
  const isOwner = (session?.staffRole || session?.role) === "owner";

  return (
    <>
      {/* Tabs */}
      <TabStrip tabs={TABS} active={tab} onChange={(k) => setTab(k)} />

      {/* Tab content */}
      <div className="mt-4 space-y-4">
        {tab === "overview" && <OverviewTab isOwner={isOwner} />}
        {tab === "new" && <NewExpenseTab />}
        {tab === "budgets" && <BudgetsTab isOwner={isOwner} />}
        {tab === "petty" && <PettyCashTab isOwner={isOwner} />}
        {tab === "recurring" && <RecurringTab isOwner={isOwner} />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({ isOwner }: { isOwner: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date } | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [accum, setAccum] = useState<ExpenseRow[]>([]);
  const [viewExpense, setViewExpense] = useState<ExpenseRow | null>(null);
  const [editTarget, setEditTarget] = useState<EditableExpense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter !== "All") params.set("status", statusFilter);
  if (paymentFilter !== "All") params.set("payment_method", paymentFilter);
  if (categoryFilter) params.set("category_id", categoryFilter);
  if (dateRange?.from) params.set("start_date", dateRange.from.toISOString());
  if (dateRange?.to) params.set("end_date", dateRange.to.toISOString());
  params.set("page", String(page));
  params.set("page_size", "50");

  const { data, isFetching, isLoading } = useQuery<{
    rows: ExpenseRow[];
    total: number;
    page: number;
    pageSize: number;
  }>({
    queryKey: ["expenses", search, statusFilter, paymentFilter, categoryFilter, dateRange, page],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/expenses?${params}`, {
        headers: { "x-session-token": sessionToken() },
      });
      if (!res.ok) throw new Error("Failed to load expenses");
      return res.json();
    },
  });

  const { data: summary } = useQuery<SummaryData>({
    queryKey: ["expense-summary"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/expenses/summary", {
        headers: { "x-session-token": sessionToken() },
      });
      if (!res.ok) throw new Error("Failed to load summary");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/expenses/categories");
      if (!res.ok) throw new Error("Failed to load categories");
      return res.json();
    },
  });

  // Accumulate pages for the load-more list; page-1 fetches replace the list.
  useEffect(() => {
    if (!data?.rows) return;
    setAccum((prev) => {
      if (data.page === 1) return data.rows;
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...data.rows.filter((r) => !r.id || !seen.has(r.id))];
    });
  }, [data]);

  // Reset to page 1 whenever any filter changes.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, paymentFilter, categoryFilter, dateRange]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
    queryClient.invalidateQueries({ queryKey: ["expense-budgets"] });
    queryClient.invalidateQueries({ queryKey: ["petty-cash"] });
    setAccum([]);
    setPage(1);
  };

  const setStatus = async (row: ExpenseRow, status: string) => {
    const res = await fetch(`/api/dashboard/expenses/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-session-token": sessionToken() },
      body: JSON.stringify({ status }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(payload.error || `HTTP ${res.status}`);
      return;
    }
    toast.success(
      status === "approved"
        ? "Expense approved"
        : status === "rejected"
          ? "Expense rejected"
          : "Status updated",
    );
    refresh();
  };

  const removeExpense = async (row: ExpenseRow) => {
    const res = await fetch(`/api/dashboard/expenses/${row.id}`, {
      method: "DELETE",
      headers: { "x-session-token": sessionToken() },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(payload.error || `HTTP ${res.status}`);
      return;
    }
    toast.success("Expense deleted");
    refresh();
  };

  const exportCSV = () => {
    if (!accum.length) return toast.info("No expenses to export");
    const headers = [
      "Date",
      "Number",
      "Name",
      "Category",
      "Payee",
      "Amount",
      "VAT",
      "TDS",
      "Total",
      "Method",
      "Payment",
      "Status",
    ];
    const rows = accum.map((e) => [
      new Date(e.expenseDate).toLocaleDateString("en-BD"),
      e.expenseNumber,
      e.name,
      e.categoryName || "",
      e.payeeName || "",
      String(e.amount / 100),
      String(e.vatAmount / 100),
      String(e.tdsAmount / 100),
      String(e.totalAmount / 100),
      e.paymentMethod,
      e.paymentStatus,
      e.status,
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => (String(v).includes(",") ? `"${v}"` : v)).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported expenses");
  };

  const total = data?.total ?? 0;
  const hasMore = accum.length < total;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="This month" value={bdt(summary?.currentMonthTotal ?? 0)} />
        <Stat label="Last month" value={bdt(summary?.prevMonthTotal ?? 0)} />
        <Stat label="Awaiting payment" value={bdt(summary?.pendingTotal ?? 0)} />
        <Stat label="VAT (6 mo)" value={bdt(summary?.vat ?? 0)} />
        <Stat label="TDS (6 mo)" value={bdt(summary?.tds ?? 0)} />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, payee, number, notes..."
            className="min-w-48 flex-1"
          />
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <Button variant="surface" size="sm" onClick={exportCSV}>
            <Download size={14} className="mr-1" /> Export
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-border/80 focus:border-foreground/80"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="h-9 border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-border/80 focus:border-foreground/80"
          >
            {PAYMENT_METHOD_FILTERS.map((m) => (
              <option key={m} value={m}>
                {m === "All" ? "All payments" : METHOD_LABELS[m] || m}
              </option>
            ))}
          </select>
          <div className="w-48">
            <SearchSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
              placeholder="All categories"
            />
          </div>
          {(statusFilter !== "All" || paymentFilter !== "All" || categoryFilter || dateRange) && (
            <button
              onClick={() => {
                setStatusFilter("All");
                setPaymentFilter("All");
                setCategoryFilter("");
                setDateRange(undefined);
              }}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading expenses...</div>
        ) : accum.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <List size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium text-foreground">No expenses found</p>
            <p className="text-sm">Start tracking expenses by adding your first entry</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Number</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accum.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-border last:border-b-0 hover:bg-surface"
                    >
                      <td className="px-3 py-2.5">
                        {new Date(e.expenseDate).toLocaleDateString("en-BD")}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{e.expenseNumber}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{e.name}</div>
                        {e.payeeName && (
                          <div className="text-xs text-muted-foreground">→ {e.payeeName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">{e.categoryName || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{bdt(e.totalAmount)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          {methodPill(e.paymentMethod)}
                          {e.paymentStatus !== "paid" && paymentStatusPill(e.paymentStatus)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{statusPill(e.status)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => setViewExpense(e)}
                            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                            title="View"
                          >
                            <Eye size={14} />
                          </button>
                          {isOwner && e.status === "pending" && (
                            <>
                              <button
                                onClick={() => setStatus(e, "approved")}
                                className="rounded p-1 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600"
                                title="Approve"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setStatus(e, "rejected")}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title="Reject"
                              >
                                <XCircle size={14} />
                              </button>
                            </>
                          )}
                          {isOwner && (
                            <>
                              <button
                                onClick={() => setEditTarget({ ...e, id: String(e.id) })}
                                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(e)}
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="border-t border-border p-3 text-center">
                <Button
                  variant="surface"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={isFetching}
                >
                  Load more ({accum.length} of {total})
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Insights */}
      <ExpenseInsights
        monthly={summary?.monthly ?? []}
        byCategory={summary?.byCategory ?? []}
        byPayee={(summary?.byPayee ?? [])
          .filter((p) => p.payee)
          .map((p) => ({ payee: p.payee as string, total: p.total }))}
      />

      {/* View modal */}
      {viewExpense && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setViewExpense(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto border border-border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium">{viewExpense.name}</h3>
              <button onClick={() => setViewExpense(null)} className="rounded p-1 hover:bg-surface">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expense #</span>
                <span className="font-mono">{viewExpense.expenseNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{new Date(viewExpense.expenseDate).toLocaleDateString("en-BD")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <span>{viewExpense.categoryName || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span>{bdt(viewExpense.amount)}</span>
              </div>
              {viewExpense.vatAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT</span>
                  <span>{bdt(viewExpense.vatAmount)}</span>
                </div>
              )}
              {viewExpense.tdsAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TDS</span>
                  <span>{bdt(viewExpense.tdsAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3 font-medium">
                <span>Total</span>
                <span>{bdt(viewExpense.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment</span>
                {methodPill(viewExpense.paymentMethod)}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid?</span>
                {paymentStatusPill(viewExpense.paymentStatus)}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                {statusPill(viewExpense.status)}
              </div>
              {viewExpense.payeeName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payee</span>
                  <span>{viewExpense.payeeName}</span>
                </div>
              )}
              {viewExpense.vendorInvoiceNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice #</span>
                  <span>{viewExpense.vendorInvoiceNumber}</span>
                </div>
              )}
              {viewExpense.paymentReference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span>{viewExpense.paymentReference}</span>
                </div>
              )}
              {viewExpense.receiptUrl && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt</span>
                  <a
                    href={viewExpense.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    View attachment
                  </a>
                </div>
              )}
              {viewExpense.notes && (
                <div className="border-t border-border pt-3">
                  <span className="text-muted-foreground">Notes:</span>
                  <p className="mt-1">{viewExpense.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit dialog (owner) */}
      <EditExpenseDialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        expense={editTarget}
        categories={categories}
        onSaved={refresh}
      />

      {/* Delete confirm (owner) */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete expense"
        description={`Delete "${deleteTarget?.name}" (${deleteTarget ? bdt(deleteTarget.totalAmount) : ""})? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            removeExpense(deleteTarget);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
