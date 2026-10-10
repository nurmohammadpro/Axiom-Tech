"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Pill, Stat, Table } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeaves, useLeaveTypes, useStaff } from "@/lib/hooks";
import { createLeave, updateLeave } from "@/lib/api";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";

const inputCls =
  "w-full border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground";

const tone = (s: string) =>
  s === "approved" ? "success" : s === "rejected" ? "danger" : s === "pending" ? "warn" : "muted";

export function LeavesView() {
  const qc = useQueryClient();
  const { data: leaves = [] } = useLeaves();
  const { data: types = [] } = useLeaveTypes();
  const { data: staff = [] } = useStaff();

  const [form, setForm] = useState({
    staffId: "",
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);

  const pending = leaves.filter((l) => l.status === "pending");
  const approved = leaves.filter((l) => l.status === "approved");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["hr", "leaves"] });
    void qc.invalidateQueries({ queryKey: ["dashboard", "staff"] });
  };

  async function add() {
    if (!form.staffId || !form.leaveTypeId || !form.startDate || !form.endDate) {
      toast.error("Staff, leave type and dates are required");
      return;
    }
    setBusy(true);
    try {
      await createLeave({
        staffId: form.staffId,
        leaveTypeId: Number(form.leaveTypeId),
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason || undefined,
      });
      toast.success("Leave request added");
      setForm({ staffId: "", leaveTypeId: "", startDate: "", endDate: "", reason: "" });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add leave");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, status: string) {
    try {
      await updateLeave(id, status);
      toast.success(`Leave ${status}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat label="Requests" value={String(leaves.length)} />
        <Stat label="Pending" value={String(pending.length)} hint="awaiting approval" />
        <Stat label="Approved" value={String(approved.length)} />
        <Stat label="Leave types" value={String(types.length)} hint="configured" />
      </div>

      <Card className="mt-3 p-3">
        <div className="text-xs font-medium">New leave request</div>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <Select
            value={form.staffId}
            onValueChange={(v) => setForm((f) => ({ ...f, staffId: v }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Staff" />
            </SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={form.leaveTypeId}
            onValueChange={(v) => setForm((f) => ({ ...f, leaveTypeId: v }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Leave type" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name} {t.paid ? "" : "(unpaid)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className={inputCls}
          />
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            className={inputCls}
          />
          <input
            placeholder="Reason (optional)"
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            className={inputCls + " md:col-span-3"}
          />
          <Button variant="default" onClick={() => void add()} disabled={busy}>
            <Plus size={13} /> Add request
          </Button>
        </div>
      </Card>

      <div className="mt-3">
        {leaves.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No leave requests yet.
          </div>
        ) : (
          <Table
            columns={["Staff", "Type", "From", "To", "Days", "Status", "Actions"]}
            rows={leaves.map((l) => [
              l.staffName || "—",
              l.leaveTypeName || "—",
              l.startDate,
              l.endDate,
              String(l.days),
              <Pill key="s" tone={tone(l.status)}>
                {l.status}
              </Pill>,
              l.status === "pending" ? (
                <div key="a" className="flex items-center gap-2">
                  <button
                    onClick={() => void decide(l.id, "approved")}
                    className="flex items-center gap-1 text-emerald-600 hover:underline"
                  >
                    <Check size={12} /> Approve
                  </button>
                  <button
                    onClick={() => void decide(l.id, "rejected")}
                    className="flex items-center gap-1 text-sale hover:underline"
                  >
                    <X size={12} /> Reject
                  </button>
                </div>
              ) : (
                <span key="a" className="text-xs text-muted-foreground">
                  —
                </span>
              ),
            ])}
          />
        )}
      </div>
    </>
  );
}

export default LeavesView;
