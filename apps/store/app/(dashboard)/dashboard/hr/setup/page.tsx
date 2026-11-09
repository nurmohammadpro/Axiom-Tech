"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Pill, Table } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { useLeaveTypes, useStaff } from "@/lib/hooks";
import { createLeaveType, deleteLeaveType, updateStaff } from "@/lib/api";
import { bdt } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { confirmDialog } from "@/components/confirm-host";

const inputCls =
  "w-full border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground";

export function HrSetupView() {
  const qc = useQueryClient();
  const { data: types = [] } = useLeaveTypes();
  const { data: staff = [] } = useStaff();

  const [lt, setLt] = useState({ name: "", code: "", paid: true, annualAllowanceDays: "0" });
  const [salaries, setSalaries] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function addType() {
    if (!lt.name.trim() || !lt.code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setBusy(true);
    try {
      await createLeaveType({
        name: lt.name.trim(),
        code: lt.code.trim().toUpperCase(),
        paid: lt.paid,
        annualAllowanceDays: Number(lt.annualAllowanceDays) || 0,
      });
      toast.success("Leave type added");
      setLt({ name: "", code: "", paid: true, annualAllowanceDays: "0" });
      void qc.invalidateQueries({ queryKey: ["hr", "leave-types"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function removeType(id: number) {
    if (!(await confirmDialog({ title: "Delete leave type", description: "Delete this leave type? Existing requests keep their records." }))) return;
    try {
      await deleteLeaveType(id);
      toast.success("Deleted");
      void qc.invalidateQueries({ queryKey: ["hr", "leave-types"] });
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function saveSalary(id: string) {
    const raw = salaries[id];
    if (raw === undefined) return;
    try {
      await updateStaff(id, { basicSalary: raw === "" ? null : Number(raw) });
      toast.success("Salary saved");
      void qc.invalidateQueries({ queryKey: ["dashboard", "staff"] });
    } catch {
      toast.error("Failed to save salary");
    }
  }

  return (
    <>
      <Card className="p-3">
        <div className="text-xs font-medium">Leave types</div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Name</span>
            <input
              value={lt.name}
              onChange={(e) => setLt((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Code</span>
            <input
              value={lt.code}
              onChange={(e) => setLt((f) => ({ ...f, code: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Annual days</span>
            <input
              type="number"
              value={lt.annualAllowanceDays}
              onChange={(e) => setLt((f) => ({ ...f, annualAllowanceDays: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="flex items-center gap-1 pb-2 text-sm">
            <input
              type="checkbox"
              checked={lt.paid}
              onChange={(e) => setLt((f) => ({ ...f, paid: e.target.checked }))}
            />
            Paid
          </label>
          <Button variant="default" onClick={() => void addType()} disabled={busy}>
            <Plus size={13} /> Add type
          </Button>
        </div>

        <div className="mt-3">
          {types.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No leave types yet (e.g. Casual, Sick, Annual).
            </div>
          ) : (
            <Table
              columns={["Name", "Code", "Paid", "Annual days", ""]}
              rows={types.map((t) => [
                t.name,
                <span key="c" className="font-mono text-xs">
                  {t.code}
                </span>,
                <Pill key="p" tone={t.paid ? "success" : "muted"}>
                  {t.paid ? "Paid" : "Unpaid"}
                </Pill>,
                String(t.annualAllowanceDays),
                <button
                  key="d"
                  onClick={() => void removeType(t.id)}
                  className="flex items-center gap-1 text-sale hover:underline"
                >
                  <Trash2 size={12} /> Delete
                </button>,
              ])}
            />
          )}
        </div>
      </Card>

      <Card className="mt-3 p-3">
        <div className="text-xs font-medium">Salaries</div>
        <div className="text-xs text-muted-foreground">
          Monthly salary feeds payroll. Staff without a salary are skipped.
        </div>
        <div className="mt-3">
          {staff.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No staff yet.</div>
          ) : (
            <Table
              columns={["Staff", "Designation", "Monthly salary", ""]}
              rows={staff.map((s) => [
                `${s.firstName} ${s.lastName}`,
                s.designation || "—",
                <input
                  key="sal"
                  type="number"
                  defaultValue={s.basicSalary != null ? String(s.basicSalary) : ""}
                  onChange={(e) => setSalaries((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  placeholder="0"
                  className={inputCls + " max-w-[160px]"}
                />,
                <button
                  key="save"
                  onClick={() => void saveSalary(s.id)}
                  className="text-primary hover:underline"
                >
                  Save
                </button>,
              ])}
            />
          )}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {staff.filter((s) => s.basicSalary).length} of {staff.length} staff have a basic salary
          {staff.some((s) => s.basicSalary)
            ? ` · basic total ${bdt(staff.reduce((sum, s) => sum + (s.basicSalary ?? 0), 0))}`
            : ""}
        </div>
      </Card>
    </>
  );
}

export default HrSetupView;
