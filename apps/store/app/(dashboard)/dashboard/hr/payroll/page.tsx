"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Pill, Stat, Table } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { usePayrollRuns, usePayrollRun } from "@/lib/hooks";
import { generatePayroll, updatePayrollRun } from "@/lib/api";
import { bdt } from "@/lib/utils";
import { toast } from "sonner";
import { Download, Play, X } from "lucide-react";
import { SortableTable } from "@/components/dashboard/sortable-table";

const inputCls =
  "w-full border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground";

const tone = (s: string) => (s === "paid" ? "success" : s === "finalized" ? "info" : "muted");

function monthDefaults() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  return { start, end };
}

export function PayrollView() {
  const qc = useQueryClient();
  const { data: runs = [] } = usePayrollRuns();
  const defaults = useMemo(monthDefaults, []);
  const [period, setPeriod] = useState({ start: defaults.start, end: defaults.end });
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: detail } = usePayrollRun(selected);

  const totalNet = runs.reduce((s, r) => s + r.totalNet, 0);
  const drafts = runs.filter((r) => r.status === "draft").length;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["hr", "payroll"] });
    if (selected) void qc.invalidateQueries({ queryKey: ["hr", "payroll", selected] });
  };

  async function generate() {
    if (!period.start || !period.end) {
      toast.error("Pick a period");
      return;
    }
    setBusy(true);
    try {
      const res = await generatePayroll({ periodStart: period.start, periodEnd: period.end });
      toast.success(`Payroll generated for ${res.itemCount} staff`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await updatePayrollRun(id, status);
      toast.success(`Payroll ${status}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat label="Payroll runs" value={String(runs.length)} />
        <Stat label="Drafts" value={String(drafts)} hint="not finalized" />
        <Stat label="Total net (all runs)" value={bdt(totalNet)} />
        <Stat
          label="Staff with salary"
          value={String(detail?.items.length ?? "—")}
          hint="in selected run"
        />
      </div>

      <Card className="mt-3 p-3">
        <div className="text-xs font-medium">Generate payroll</div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Period start</span>
            <input
              type="date"
              value={period.start}
              onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Period end</span>
            <input
              type="date"
              value={period.end}
              onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
              className={inputCls}
            />
          </label>
          <Button variant="default" onClick={() => void generate()} disabled={busy}>
            <Play size={13} /> {busy ? "Generating…" : "Generate draft"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Base salary per staff, minus unpaid-leave proration.
          </span>
        </div>
      </Card>

      <div className="mt-3">
        {runs.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No payroll runs yet. Generate one above.
          </div>
        ) : (
          <Table
            columns={["Period", "Status", "Gross", "Deductions", "Net", "Staff", "Actions"]}
            rows={runs.map((r) => [
              `${r.periodStart} → ${r.periodEnd}`,
              <Pill key="s" tone={tone(r.status)}>
                {r.status}
              </Pill>,
              bdt(r.totalGross),
              bdt(r.totalDeductions),
              <span key="n" className="font-medium">
                {bdt(r.totalNet)}
              </span>,
              String(r.itemCount ?? 0),
              <button
                key="a"
                onClick={() => setSelected(r.id)}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Download size={12} /> View
              </button>,
            ])}
            sortData={runs}
            sortKeys={[
              "periodStart",
              "status",
              "totalGross",
              "totalDeductions",
              "totalNet",
              null,
              null,
            ]}
          />
        )}
      </div>

      {selected && detail && (
        <Card className="mt-3 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              Payroll {detail.run.periodStart} → {detail.run.periodEnd}
            </div>
            <div className="flex items-center gap-2">
              {detail.run.status === "draft" && (
                <Button
                  variant="default"
                  onClick={() => void setStatus(detail.run.id, "finalized")}
                >
                  Finalize
                </Button>
              )}
              {detail.run.status === "finalized" && (
                <Button variant="default" onClick={() => void setStatus(detail.run.id, "paid")}>
                  Mark paid
                </Button>
              )}
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="mt-3">
            <SortableTable
              columns={[
                {
                  key: "staffName",
                  header: "Staff",
                  sortable: true,
                  render: (v: string | null) => v || "—",
                },
                {
                  key: "baseSalary",
                  header: "Basic",
                  sortable: true,
                  className: "text-right",
                  render: (v: number) => bdt(v),
                },
                {
                  key: "allowances",
                  header: "Allowances",
                  className: "text-xs text-muted-foreground",
                  render: (v: { label: string; amount: number }[] | null) =>
                    (v ?? []).map((a) => `${a.label}: ${bdt(a.amount)}`).join(", ") || "—",
                },
                {
                  key: "grossSalary",
                  header: "Gross",
                  sortable: true,
                  className: "text-right",
                  render: (v: number) => <span className="font-medium">{bdt(v)}</span>,
                },
                {
                  key: "deductions",
                  header: "Deductions",
                  className: "text-xs text-muted-foreground",
                  render: (v: { label: string; amount: number }[] | null) =>
                    (v ?? []).map((d) => `${d.label}: ${bdt(d.amount)}`).join(", ") || "—",
                },
                {
                  key: "netSalary",
                  header: "Net",
                  sortable: true,
                  className: "text-right",
                  render: (v: number) => <span className="font-medium">{bdt(v)}</span>,
                },
              ]}
              data={(detail.items ?? []).map((it) => ({ ...it }))}
              rowKey={(it) => it.id}
              pageSize={25}
              emptyMessage="No staff with a salary for this period."
            />
          </div>
        </Card>
      )}
    </>
  );
}

export default PayrollView;
