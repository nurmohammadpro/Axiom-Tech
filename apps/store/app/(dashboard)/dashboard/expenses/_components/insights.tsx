"use client";

import { Card } from "@/components/dashboard/dashboard-shell";
import { bdt } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Expense insights — CSS bar lists (dataviz method: single hue, text tokens,
// direct value labels, no legend for a single series).
// ---------------------------------------------------------------------------

export interface MonthlyPoint {
  month: string; // YYYY-MM
  total: number; // poisha
}

export interface CategoryPoint {
  categoryId: number | null;
  name: string | null;
  color: string | null;
  total: number; // poisha
}

export interface PayeePoint {
  payee: string;
  total: number; // poisha
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-BD", {
    month: "short",
    timeZone: "UTC",
  });
}

/** One horizontal bar row: label — track/fill — value. */
function BarRow({
  label,
  value,
  ratio,
  fill,
  title,
  chip,
}: {
  label: string;
  value: string;
  ratio: number; // 0..1 against the row set's max
  fill: string; // className or "" when `chip` supplies the color
  title: string;
  chip?: string | null;
}) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <span className="w-16 shrink-0 truncate text-xs text-muted-foreground">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={chip ? "h-full rounded-full" : `h-full rounded-full ${fill}`}
          style={{
            width: `${Math.max(2, Math.round(ratio * 100))}%`,
            ...(chip ? { backgroundColor: chip } : {}),
          }}
        />
      </div>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

export function ExpenseInsights({
  monthly,
  byCategory,
  byPayee,
}: {
  monthly: MonthlyPoint[];
  byCategory: CategoryPoint[];
  byPayee: PayeePoint[];
}) {
  const maxMonth = Math.max(1, ...monthly.map((m) => m.total));
  const maxCat = Math.max(1, ...byCategory.map((c) => c.total));
  const maxPayee = Math.max(1, ...byPayee.map((p) => p.total));

  if (!monthly.length && !byCategory.length) {
    return null;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-medium">Monthly trend</h3>
        <div className="space-y-2">
          {monthly.map((m) => (
            <BarRow
              key={m.month}
              label={monthLabel(m.month)}
              value={bdt(m.total)}
              ratio={m.total / maxMonth}
              fill="bg-primary"
              title={`${monthLabel(m.month)}: ${bdt(m.total)}`}
            />
          ))}
          {!monthly.length && (
            <p className="text-xs text-muted-foreground">No expenses in the last 6 months.</p>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium">Top categories</h3>
          <div className="space-y-2">
            {byCategory.map((c) => (
              <BarRow
                key={c.categoryId ?? c.name ?? "other"}
                label={c.name || "Uncategorized"}
                value={bdt(c.total)}
                ratio={c.total / maxCat}
                fill=""
                chip={c.color || undefined}
                title={`${c.name || "Uncategorized"}: ${bdt(c.total)}`}
              />
            ))}
            {!byCategory.length && (
              <p className="text-xs text-muted-foreground">No category data yet.</p>
            )}
          </div>
        </Card>

        {byPayee.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-medium">Top payees</h3>
            <div className="space-y-2">
              {byPayee.map((p) => (
                <BarRow
                  key={p.payee}
                  label={p.payee}
                  value={bdt(p.total)}
                  ratio={p.total / maxPayee}
                  fill="bg-primary/70"
                  title={`${p.payee}: ${bdt(p.total)}`}
                />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
