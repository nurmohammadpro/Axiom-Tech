"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { bdt } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/expense-utils";
import { handleEnterAdvance } from "@/lib/focus-navigation";
import { sessionToken } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, Tag, Pencil, X, Paperclip, Check } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
  id: number;
  name: string;
  code: string;
  icon: string | null;
  color: string | null;
  isTaxDeductible: boolean | null;
  tdsRate: number | null;
  vatApplicable: boolean | null;
}

interface ExpenseItem {
  tempId: number;
  categoryId: number | null;
  description: string;
  /** Taka in the form; the bulk API converts to poisha. */
  amount: number;
  paymentMethod: string;
  payeeName: string;
  receiptUrl: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

let nextTempId = 1;

const ICON_OPTIONS = [
  "Zap",
  "Home",
  "Truck",
  "CreditCard",
  "Users",
  "Package",
  "Monitor",
  "Wrench",
  "Megaphone",
  "FileText",
  "Shield",
  "RefreshCw",
  "Gift",
  "Fuel",
  "Utensils",
  "BookOpen",
  "DollarSign",
  "AlertTriangle",
  "Smartphone",
  "CheckCircle",
  "Coffee",
  "Phone",
  "Clock",
  "Percent",
];

const COLOR_OPTIONS = [
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

const PAYMENT_STATUS_OPTIONS = ["paid", "pending", "partial"] as const;

function emptyItem(): ExpenseItem {
  return {
    tempId: nextTempId++,
    categoryId: null,
    description: "",
    amount: 0,
    paymentMethod: "cash",
    payeeName: "",
    receiptUrl: "",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewExpenseTab() {
  const queryClient = useQueryClient();

  // Expense form state
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<string>("paid");
  const [items, setItems] = useState<ExpenseItem[]>([emptyItem()]);

  // Category form state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);
  const [catForm, setCatForm] = useState({
    name: "",
    code: "",
    icon: "Zap",
    color: "#3b82f6",
    isTaxDeductible: false,
    tdsRate: 0,
    vatApplicable: false,
  });

  // Queries
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/expenses/categories");
      if (!res.ok) throw new Error("Failed to load categories");
      return res.json();
    },
  });

  // Mutations
  const saveExpense = useMutation({
    mutationFn: async () => {
      const validItems = items.filter((i) => i.description.trim() && i.amount > 0);
      if (!validItems.length) throw new Error("Add at least one expense item");

      const res = await fetch("/api/dashboard/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken() },
        body: JSON.stringify({
          expenseDate,
          notes,
          paymentStatus,
          items: validItems.map(({ tempId: _, ...rest }) => rest),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      return data as { created: number; warnings?: string[] };
    },
    onSuccess: (data) => {
      toast.success(`Saved ${data.created} expense${data.created === 1 ? "" : "s"}`);
      for (const w of data.warnings ?? []) toast.warning(w);
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
      queryClient.invalidateQueries({ queryKey: ["expense-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["petty-cash"] });
      setItems([emptyItem()]);
      setNotes("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveCategory = useMutation({
    mutationFn: async (data: typeof catForm) => {
      const url = editCategory
        ? `/api/dashboard/expenses/categories/${editCategory.id}`
        : "/api/dashboard/expenses/categories";
      const method = editCategory ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken() },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save category");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(editCategory ? "Category updated" : "Category created");
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      resetCategoryForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/dashboard/expenses/categories/${id}`, {
        method: "DELETE",
        headers: { "x-session-token": sessionToken() },
      });
      if (!res.ok) throw new Error("Failed to delete category");
    },
    onSuccess: () => {
      toast.success("Category deleted");
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Item helpers
  const updateItem = (tempId: number, field: keyof ExpenseItem, value: string | number | null) => {
    setItems((prev) => prev.map((i) => (i.tempId === tempId ? { ...i, [field]: value } : i)));
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (tempId: number) => {
    setItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  const uploadReceipt = async (tempId: number, file: File) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "expenses/receipts");
      const res = await fetch("/api/dashboard/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Receipt upload failed");
        return;
      }
      updateItem(tempId, "receiptUrl", data.url as string);
      toast.success("Receipt attached");
    } catch {
      toast.error("Receipt upload failed");
    }
  };

  // Category helpers
  const resetCategoryForm = () => {
    setCatForm({
      name: "",
      code: "",
      icon: "Zap",
      color: "#3b82f6",
      isTaxDeductible: false,
      tdsRate: 0,
      vatApplicable: false,
    });
    setEditCategory(null);
    setShowCategoryModal(false);
  };

  const openEditCategory = (cat: Category) => {
    setEditCategory(cat);
    setCatForm({
      name: cat.name,
      code: cat.code,
      icon: cat.icon || "Zap",
      color: cat.color || "#3b82f6",
      isTaxDeductible: cat.isTaxDeductible || false,
      tdsRate: cat.tdsRate || 0,
      vatApplicable: cat.vatApplicable || false,
    });
    setShowCategoryModal(true);
  };

  const total = items.reduce((s, i) => s + i.amount, 0);
  const tdsTotal = items.reduce((s, i) => {
    const cat = categories.find((c) => c.id === i.categoryId);
    const rate = cat?.isTaxDeductible ? cat.tdsRate || 0 : 0;
    return s + Math.round((i.amount * rate) / 100);
  }, 0);
  const validItemCount = items.filter((i) => i.description.trim() && i.amount > 0).length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Left: Expense Form */}
      <div className="space-y-4 lg:col-span-2">
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium">Expense Details</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Date *
              </label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                onKeyDown={handleEnterAdvance}
                className="h-9"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Payment status
              </label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Notes
              </label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={handleEnterAdvance}
                placeholder="General notes"
                className="h-9"
              />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium">Expense Items</h3>
            <Button variant="surface" size="sm" onClick={addItem}>
              <Plus size={13} className="mr-1" /> Add Item
            </Button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const cat = categories.find((c) => c.id === item.categoryId);
              const tdsRate = cat?.isTaxDeductible ? cat.tdsRate || 0 : 0;
              const tdsAmount = Math.round((item.amount * tdsRate) / 100);
              return (
                <div key={item.tempId} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      Item {idx + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(item.tempId)}
                        className="rounded p-1 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                        Category
                      </label>
                      <SearchSelect
                        value={item.categoryId ? String(item.categoryId) : ""}
                        onChange={(val) =>
                          updateItem(item.tempId, "categoryId", val ? Number(val) : null)
                        }
                        options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                        placeholder="Select..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                        Description *
                      </label>
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(item.tempId, "description", e.target.value)}
                        onKeyDown={handleEnterAdvance}
                        placeholder="What was this expense for?"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                        Amount *
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={item.amount || ""}
                        onChange={(e) => updateItem(item.tempId, "amount", Number(e.target.value))}
                        onKeyDown={handleEnterAdvance}
                        placeholder="0"
                        className="h-9"
                      />
                      {tdsRate > 0 && item.amount > 0 && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          TDS {tdsRate}% −{bdt(tdsAmount)} → net {bdt(item.amount - tdsAmount)}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                        Payment
                      </label>
                      <Select
                        value={item.paymentMethod}
                        onValueChange={(val) => updateItem(item.tempId, "paymentMethod", val)}
                      >
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
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                        Payee
                      </label>
                      <Input
                        value={item.payeeName}
                        onChange={(e) => updateItem(item.tempId, "payeeName", e.target.value)}
                        onKeyDown={handleEnterAdvance}
                        placeholder="Who was paid?"
                        className="h-9"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="w-full">
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,.pdf"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadReceipt(item.tempId, f);
                            e.target.value = "";
                          }}
                        />
                        <span className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm hover:border-border/80">
                          {item.receiptUrl ? (
                            <>
                              <Check size={13} className="text-emerald-600" /> Attached
                            </>
                          ) : (
                            <>
                              <Paperclip size={13} className="text-muted-foreground" /> Receipt
                            </>
                          )}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-1 rounded-lg bg-surface px-4 py-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {validItemCount} {validItemCount === 1 ? "item" : "items"}
              </span>
              <span>{bdt(total)}</span>
            </div>
            {tdsTotal > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>TDS deducted</span>
                <span>−{bdt(tdsTotal)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Net</span>
              <span>{bdt(total - tdsTotal)}</span>
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={() => saveExpense.mutate()}
            disabled={saveExpense.isPending || validItemCount === 0}
          >
            <Save size={14} className="mr-1" />
            {saveExpense.isPending ? "Saving..." : "Save Expenses"}
          </Button>
        </div>
      </div>

      {/* Right: Categories */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Categories</h3>
          <Button
            variant="surface"
            size="sm"
            onClick={() => {
              resetCategoryForm();
              setShowCategoryModal(true);
            }}
          >
            <Plus size={13} className="mr-1" /> New
          </Button>
        </div>

        <div className="space-y-2">
          {categories.length === 0 ? (
            <div className="rounded-lg border border-border p-6 text-center">
              <Tag size={32} className="mx-auto mb-2 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No categories yet</p>
              <p className="text-xs text-muted-foreground">Create one to get started</p>
            </div>
          ) : (
            categories.map((cat) => (
              <div
                key={cat.id}
                className="group flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-surface"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: cat.color || "#3b82f6" }}
                >
                  <Tag size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{cat.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {cat.code}
                    {cat.vatApplicable ? " · VAT" : ""}
                    {cat.isTaxDeductible ? ` · TDS ${cat.tdsRate || 0}%` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEditCategory(cat)}
                    className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => setDeleteCategoryId(cat.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Category Modal */}
      {showCategoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={resetCategoryForm}
        >
          <div
            className="w-full max-w-md border border-border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {editCategory ? "Edit Category" : "New Category"}
              </h3>
              <button onClick={resetCategoryForm} className="rounded p-1 hover:bg-surface">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Name *
                </label>
                <Input
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  onKeyDown={handleEnterAdvance}
                  placeholder="e.g. Rent, Utilities"
                  className="h-9"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Code
                </label>
                <Input
                  value={catForm.code}
                  onChange={(e) => setCatForm({ ...catForm, code: e.target.value })}
                  onKeyDown={handleEnterAdvance}
                  placeholder="auto-generated if empty"
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Icon
                  </label>
                  <Select
                    value={catForm.icon}
                    onValueChange={(val) => setCatForm({ ...catForm, icon: val })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ICON_OPTIONS.map((i) => (
                        <SelectItem key={i} value={i}>
                          {i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setCatForm({ ...catForm, color: c })}
                        className={`h-6 w-6 rounded-full border-2 ${catForm.color === c ? "border-foreground" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={catForm.vatApplicable}
                    onChange={(e) => setCatForm({ ...catForm, vatApplicable: e.target.checked })}
                    className="rounded"
                  />
                  VAT Applicable
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={catForm.isTaxDeductible}
                    onChange={(e) => setCatForm({ ...catForm, isTaxDeductible: e.target.checked })}
                    className="rounded"
                  />
                  TDS Deductible
                </label>
              </div>
              {catForm.isTaxDeductible && (
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    TDS Rate (%)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={catForm.tdsRate}
                    onChange={(e) => setCatForm({ ...catForm, tdsRate: Number(e.target.value) })}
                    onKeyDown={handleEnterAdvance}
                    className="h-9"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="surface" size="sm" onClick={resetCategoryForm}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveCategory.mutate(catForm)}
                  disabled={saveCategory.isPending || !catForm.name.trim()}
                >
                  {saveCategory.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteCategoryId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteCategoryId(null);
        }}
        title="Delete Category"
        description="Are you sure you want to delete this category? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteCategoryId !== null) {
            deleteCategory.mutate(deleteCategoryId);
            setDeleteCategoryId(null);
          }
        }}
      />
    </div>
  );
}
