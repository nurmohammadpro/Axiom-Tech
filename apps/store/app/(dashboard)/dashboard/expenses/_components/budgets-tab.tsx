"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Card, Pill } from "@/components/dashboard/dashboard-shell";
import { Input } from "@/components/ui/input";
import { sessionToken } from "@/lib/api";
import { getBudgetStatus } from "@/lib/expense-utils";
import { bdt } from "@/lib/utils";

interface BudgetRow {
  categoryId: number;
  name: string;
  code: string;
  color: string | null;
  allocated: number; // poisha
  spent: number; // poisha
  defaultBudgetAmount: number; // poisha
  budgetAlertThreshold: number; // percent
}

/**
 * Monthly budget-per-category planner: set allocations, watch spend against
 * them. Allocations are owner-editable; the server enforces that too.
 */
export function BudgetsTab({ isOwner }: { isOwner: boolean }) {
  const queryClient = useQueryClient();
  const [monthOffset, setMonthOffset] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const monthDate = new Date();
  monthDate.setDate(1);
  monthDate.setMonth(monthDate.getMonth() + monthOffset);
  const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;

  const { data, isLoading } = useQuery<{ month: string; rows: BudgetRow[] }>({
    queryKey: ["expense-budgets", month],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/expenses/budgets?month=${month}`, {
        headers: { "x-session-token": sessionToken() },
      });
      if (!res.ok) throw new Error("Failed to load budgets");
      return res.json();
    },
  });

  // Reset local drafts whenever the fetched month changes.
  useEffect(() => setDrafts({}), [month]);

  const saveAllocation = async (row: BudgetRow, taka: number) => {
    setSavingId(row.categoryId);
    try {
      const res = await fetch("/api/dashboard/expenses/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken() },
        body: JSON.stringify({
          categoryId: row.categoryId,
          month,
          allocatedAmount: Math.round(taka * 100), // poisha
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || `HTTP ${res.status}`);
        return;
      }
      toast.success(`${row.name} budget saved`);
      queryClient.invalidateQueries({ queryKey: ["expense-budgets", month] });
    } finally {
      setSavingId(null);
    }
  };

  const rows = data?.rows ?? [];
  const rowsWithBudget = rows.filter((r) => r.allocated > 0);
  const totalAllocated = rowsWithBudget.reduce((s, r) => s + r.allocated, 0);
  const totalSpent = rowsWithBudget.reduce((s, r) => s + r.spent, 0);
  const overallPct = totalAllocated ? Math.round((totalSpent / totalAllocated) * 100) : 0;
  const monthDisplay = monthDate.toLocaleDateString("en-BD", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthOffset((m) => m - 1)}
            className="rounded border border-border p-1.5 hover:bg-surface"
            aria-label="Previous month"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-36 text-center text-sm font-medium">{monthDisplay}</span>
          <button
            onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
            className="rounded border border-border p-1.5 hover:bg-surface disabled:opacity-40"
            disabled={monthOffset >= 0}
            aria-label="Next month"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        {rowsWithBudget.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Allocated <span className="font-medium text-foreground">{bdt(totalAllocated)}</span>
            </span>
            <span>
              Spent <span className="font-medium text-foreground">{bdt(totalSpent)}</span>
            </span>
            <Pill tone={overallPct >= 100 ? "danger" : overallPct >= 80 ? "warn" : "success"}>
              {overallPct}% used
            </Pill>
          </div>
        )}
      </Card>

      <Card className="p-4">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading budgets...</div>
        ) : !rows.length ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No active expense categories. Create categories from the New Expense tab first.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const pct = row.allocated ? Math.round((row.spent / row.allocated) * 100) : 0;
              const status = getBudgetStatus(row.allocated, row.spent);
              const barTone =
                status === "over"
                  ? "bg-red-500"
                  : status === "warning"
                    ? "bg-amber-500"
                    : "bg-primary";
              const draft = drafts[row.categoryId];
              const dirty =
                draft !== undefined && Math.round(Number(draft || 0) * 100) !== row.allocated;

              return (
                <div
                  key={row.categoryId}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                >
                  <div
                    className="h-7 w-7 shrink-0 rounded-lg"
                    style={{ backgroundColor: row.color || "#3b82f6" }}
                  />
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{row.name}</span>
                      {row.allocated > 0 && (
                        <Pill
                          tone={
                            status === "over" ? "danger" : status === "warning" ? "warn" : "success"
                          }
                        >
                          {pct}%
                        </Pill>
                      )}
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${barTone}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.allocated > 0
                        ? `${bdt(row.spent)} of ${bdt(row.allocated)}`
                        : `Spent ${bdt(row.spent)} — no budget set`}
                    </div>
                  </div>
                  {isOwner && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        value={draft ?? (row.allocated ? String(row.allocated / 100) : "")}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [row.categoryId]: e.target.value }))
                        }
                        placeholder={
                          row.defaultBudgetAmount ? String(row.defaultBudgetAmount / 100) : "0"
                        }
                        className="h-9 w-28"
                      />
                      <button
                        onClick={() =>
                          saveAllocation(
                            row,
                            Number(draft ?? (row.allocated ? row.allocated / 100 : 0)),
                          )
                        }
                        disabled={!dirty || savingId === row.categoryId}
                        className="h-9 rounded-md border border-border px-3 text-xs font-medium hover:bg-surface disabled:opacity-40"
                      >
                        {savingId === row.categoryId ? "..." : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
