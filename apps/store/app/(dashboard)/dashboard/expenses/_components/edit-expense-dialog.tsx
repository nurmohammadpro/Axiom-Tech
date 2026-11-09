"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sessionToken } from "@/lib/api";
import { PAYMENT_METHODS } from "@/lib/expense-utils";

export interface EditableExpense {
  id: string;
  name: string;
  description: string | null;
  categoryId: number | null;
  amount: number; // poisha
  vatAmount: number;
  tdsAmount: number;
  expenseDate: string;
  paymentMethod: string;
  paymentStatus: string;
  payeeName: string | null;
  paymentReference: string | null;
  vendorInvoiceNumber: string | null;
  status: string;
  notes: string | null;
}

/**
 * Owner-only edit for a single expense row. Amounts are entered in taka and
 * converted to poisha (×100) for the API, matching the table's units.
 */
export function EditExpenseDialog({
  open,
  onOpenChange,
  expense,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: EditableExpense | null;
  categories: { id: number; name: string }[];
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    categoryId: "" as string,
    amountTaka: "",
    expenseDate: "",
    paymentMethod: "cash",
    paymentStatus: "paid",
    payeeName: "",
    paymentReference: "",
    vendorInvoiceNumber: "",
    status: "pending",
    notes: "",
  });

  useEffect(() => {
    if (!open || !expense) return;
    setForm({
      name: expense.name,
      description: expense.description ?? "",
      categoryId: expense.categoryId ? String(expense.categoryId) : "",
      amountTaka: String(expense.amount / 100),
      expenseDate: expense.expenseDate.slice(0, 10),
      paymentMethod: expense.paymentMethod || "cash",
      paymentStatus: expense.paymentStatus || "paid",
      payeeName: expense.payeeName ?? "",
      paymentReference: expense.paymentReference ?? "",
      vendorInvoiceNumber: expense.vendorInvoiceNumber ?? "",
      status: expense.status || "pending",
      notes: expense.notes ?? "",
    });
  }, [open, expense]);

  const set = (key: keyof typeof form) => (v: string) => setForm((prev) => ({ ...prev, [key]: v }));

  const submit = async () => {
    if (!expense) return;
    const amountTaka = Number(form.amountTaka);
    if (!form.name.trim()) return toast.error("Name is required");
    if (!amountTaka || amountTaka <= 0) return toast.error("Amount must be positive");
    if (saving) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/expenses/${expense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken() },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description || null,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          amount: Math.round(amountTaka * 100), // poisha
          expenseDate: form.expenseDate || undefined,
          paymentMethod: form.paymentMethod,
          paymentStatus: form.paymentStatus,
          payeeName: form.payeeName || null,
          paymentReference: form.paymentReference || null,
          vendorInvoiceNumber: form.vendorInvoiceNumber || null,
          status: form.status,
          notes: form.notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `HTTP ${res.status}`);
        return;
      }
      toast.success("Expense updated");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
      queryClient.invalidateQueries({ queryKey: ["expense-budgets"] });
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-[10px] text-muted-foreground">Name *</label>
            <Input
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              className="h-9"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Category</label>
            <SearchSelect
              value={form.categoryId}
              onChange={set("categoryId")}
              options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
              placeholder="Category"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Amount (BDT) *</label>
            <Input
              type="number"
              min="0"
              value={form.amountTaka}
              onChange={(e) => set("amountTaka")(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Date</label>
            <Input
              type="date"
              value={form.expenseDate}
              onChange={(e) => set("expenseDate")(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Payment method</label>
            <Select value={form.paymentMethod} onValueChange={set("paymentMethod")}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Payment status</label>
            <Select value={form.paymentStatus} onValueChange={set("paymentStatus")}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["paid", "pending", "partial", "cancelled"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Approval status</label>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["pending", "approved", "rejected", "cancelled"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Payee</label>
            <Input
              value={form.payeeName}
              onChange={(e) => set("payeeName")(e.target.value)}
              placeholder="Who was paid?"
              className="h-9"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Payment reference</label>
            <Input
              value={form.paymentReference}
              onChange={(e) => set("paymentReference")(e.target.value)}
              placeholder="Txn ID / cheque no."
              className="h-9"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Vendor invoice #</label>
            <Input
              value={form.vendorInvoiceNumber}
              onChange={(e) => set("vendorInvoiceNumber")(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] text-muted-foreground">Notes</label>
            <Input
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
