"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, Pill } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sessionToken } from "@/lib/api";
import { PAYMENT_METHODS } from "@/lib/expense-utils";
import { bdt } from "@/lib/utils";
import { Pause, Play, Pencil, Plus, RefreshCw, Repeat, XCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Recurring expenses: rent/utilities/salary templates that materialize into
// real `expenses` rows via /generate (deduped by metadata.periodKey).
// ---------------------------------------------------------------------------

interface RecurringTemplate {
  id: number;
  name: string;
  description: string | null;
  categoryId: number | null;
  amount: number; // poisha
  frequency: string; // daily | weekly | bi_weekly | monthly
  startDate: string;
  dayOfMonth: number | null;
  dayOfWeek: string | null;
  paymentMethod: string;
  payeeName: string | null;
  requireApproval: boolean;
  isActive: boolean;
  status: string; // active | paused | cancelled
  nextRun: string | null;
  categoryName: string | null;
}

interface Category {
  id: number;
  name: string;
}

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "bi_weekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
] as const;

const WEEKDAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
] as const;

function statusTone(status: string): "success" | "warn" | "muted" {
  if (status === "active") return "success";
  if (status === "paused") return "warn";
  return "muted";
}

export function RecurringTab({ isOwner }: { isOwner: boolean }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTemplate | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RecurringTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    categoryId: "",
    amountTaka: "",
    frequency: "monthly",
    startDate: new Date().toISOString().slice(0, 10),
    dayOfMonth: "1",
    dayOfWeek: "1",
    paymentMethod: "cash",
    payeeName: "",
    requireApproval: true,
  });

  const { data: templates = [], isLoading } = useQuery<RecurringTemplate[]>({
    queryKey: ["recurring"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/expenses/recurring", {
        headers: { "x-session-token": sessionToken() },
      });
      if (!res.ok) throw new Error("Failed to list templates");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/expenses/categories");
      if (!res.ok) throw new Error("Failed to load categories");
      return res.json();
    },
  });

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/dashboard/expenses/recurring/generate", {
        method: "POST",
        headers: { "x-session-token": sessionToken() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return 0;
      if (data.created > 0) {
        toast.success(`Generated ${data.created} due expense${data.created === 1 ? "" : "s"}`);
        queryClient.invalidateQueries({ queryKey: ["expenses"] });
        queryClient.invalidateQueries({ queryKey: ["recurring"] });
        queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
      }
      return data.created as number;
    } finally {
      setGenerating(false);
    }
  };

  // Generate due templates once when the tab opens (fire-and-forget).
  const didGenerate = useRef(false);
  useEffect(() => {
    if (!isOwner || didGenerate.current) return;
    didGenerate.current = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const set = (key: keyof typeof form) => (v: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      categoryId: "",
      amountTaka: "",
      frequency: "monthly",
      startDate: new Date().toISOString().slice(0, 10),
      dayOfMonth: "1",
      dayOfWeek: "1",
      paymentMethod: "cash",
      payeeName: "",
      requireApproval: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (t: RecurringTemplate) => {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description ?? "",
      categoryId: t.categoryId ? String(t.categoryId) : "",
      amountTaka: String(t.amount / 100),
      frequency: t.frequency,
      startDate: t.startDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      dayOfMonth: String(t.dayOfMonth ?? "1"),
      dayOfWeek: String(t.dayOfWeek ?? "1"),
      paymentMethod: t.paymentMethod || "cash",
      payeeName: t.payeeName ?? "",
      requireApproval: t.requireApproval !== false,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    const amountTaka = Number(form.amountTaka);
    if (!form.name.trim()) return toast.error("Name is required");
    if (!amountTaka || amountTaka <= 0) return toast.error("Amount must be positive");
    if (busy) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description || null,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        amount: Math.round(amountTaka * 100), // poisha
        frequency: form.frequency,
        startDate: form.startDate || undefined,
        paymentMethod: form.paymentMethod,
        payeeName: form.payeeName || null,
        requireApproval: form.requireApproval,
      };
      if (form.frequency === "monthly") payload.dayOfMonth = Number(form.dayOfMonth);
      if (form.frequency === "weekly" || form.frequency === "bi_weekly") {
        payload.dayOfWeek = form.dayOfWeek;
      }

      const res = await fetch(
        editing
          ? `/api/dashboard/expenses/recurring/${editing.id}`
          : "/api/dashboard/expenses/recurring",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", "x-session-token": sessionToken() },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `HTTP ${res.status}`);
        return;
      }
      toast.success(editing ? "Template updated" : "Template created");
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      setDialogOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (t: RecurringTemplate) => {
    const res = await fetch(`/api/dashboard/expenses/recurring/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-session-token": sessionToken() },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || `HTTP ${res.status}`);
      return;
    }
    toast.success(t.isActive ? "Template paused" : "Template resumed");
    queryClient.invalidateQueries({ queryKey: ["recurring"] });
  };

  const cancelTemplate = async (t: RecurringTemplate) => {
    const res = await fetch(`/api/dashboard/expenses/recurring/${t.id}`, {
      method: "DELETE",
      headers: { "x-session-token": sessionToken() },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || `HTTP ${res.status}`);
      return;
    }
    toast.success("Template cancelled");
    queryClient.invalidateQueries({ queryKey: ["recurring"] });
  };
  const activeCount = templates.filter((t) => t.isActive && t.status === "active").length;
  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Repeat size={15} />
          <span>
            {activeCount} active template{activeCount === 1 ? "" : "s"} — due ones are booked as
            pending expenses on each visit here.
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="surface" size="sm" onClick={() => generate()} disabled={generating}>
            <RefreshCw size={13} className={generating ? "animate-spin" : ""} /> Generate due
          </Button>
          {isOwner && (
            <Button size="sm" onClick={openCreate}>
              <Plus size={13} className="mr-1" /> New Template
            </Button>
          )}
        </div>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading templates...</div>
      ) : !templates.length ? (
        <Card className="p-10 text-center">
          <Repeat size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No recurring templates</p>
          {isOwner ? (
            <p className="text-sm text-muted-foreground">
              Set up rent, utilities, or salary as monthly templates and they'll book themselves as
              pending expenses each period.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask the store owner to set up recurring expenses (rent, utilities, salary).
            </p>
          )}
          {isOwner && (
            <div className="mt-4">
              <Button size="sm" onClick={openCreate}>
                Create your first template
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => {
            const isActive = t.isActive && t.status === "active";
            return (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{t.name}</span>
                      <Pill tone={statusTone(t.status)}>{t.status}</Pill>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {t.categoryName || "Uncategorized"}
                      {t.payeeName ? ` → ${t.payeeName}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold">{bdt(t.amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {FREQUENCIES.find((f) => f.value === t.frequency)?.label ?? t.frequency}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {isActive && t.nextRun
                      ? `Next: ${new Date(t.nextRun).toLocaleDateString("en-BD")}`
                      : "Not scheduled"}
                  </span>
                  {isOwner && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleActive(t)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                        title={isActive ? "Pause" : "Resume"}
                      >
                        {isActive ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button
                        onClick={() => openEdit(t)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setCancelTarget(t)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Cancel template"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Template" : "New Recurring Template"}</DialogTitle>
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
                options={categoryOptions}
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
              <label className="text-[10px] text-muted-foreground">Frequency *</label>
              <Select value={form.frequency} onValueChange={set("frequency")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.frequency === "monthly" && (
              <div>
                <label className="text-[10px] text-muted-foreground">Day of month</label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={form.dayOfMonth}
                  onChange={(e) => set("dayOfMonth")(e.target.value)}
                  className="h-9"
                />
              </div>
            )}
            {(form.frequency === "weekly" || form.frequency === "bi_weekly") && (
              <div>
                <label className="text-[10px] text-muted-foreground">Run on</label>
                <Select value={form.dayOfWeek} onValueChange={set("dayOfWeek")}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-[10px] text-muted-foreground">Start date</label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate")(e.target.value)}
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
              <label className="text-[10px] text-muted-foreground">Payee</label>
              <Input
                value={form.payeeName}
                onChange={(e) => set("payeeName")(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="recurring-approval"
                checked={form.requireApproval}
                onChange={(e) => set("requireApproval")(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="recurring-approval" className="text-sm text-muted-foreground">
                Generated expenses start as pending (require my approval)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !form.name.trim() || !form.amountTaka}>
              {busy ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Cancel template"
        description={`Stop "${cancelTarget?.name}" from generating future expenses? Already-generated expenses are kept.`}
        confirmLabel="Cancel Template"
        variant="destructive"
        onConfirm={() => {
          if (cancelTarget) {
            cancelTemplate(cancelTarget);
            setCancelTarget(null);
          }
        }}
      />
    </div>
  );
}
