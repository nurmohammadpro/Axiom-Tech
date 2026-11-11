"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Pill } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { useLocations, useStockTransfers } from "@/lib/hooks";
import { createStockTransfer, getInventory, type StockTransfer } from "@/lib/api";
import { toast } from "sonner";
import { ArrowRight, Plus, X } from "lucide-react";

interface TransferItemRow {
  id: number;
  variantId: number;
  qty: string;
}

let nextItemId = 1;

/** Documented history of warehouse-to-warehouse stock transfers + the form to create one. */
export function TransfersTab({ scopedFrom }: { scopedFrom?: string | null }) {
  const qc = useQueryClient();
  const { data: transfers = [], isLoading } = useStockTransfers();
  const { data: locations = [] } = useLocations();
  const { data: inventory = [] } = useQuery({
    queryKey: ["dashboard", "inventory"],
    queryFn: getInventory,
  });

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(scopedFrom ?? "");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<TransferItemRow[]>([]);
  const [busy, setBusy] = useState(false);

  const variantOptions = useMemo(
    () =>
      inventory.map((i) => ({
        value: String(i.variantId),
        label:
          i.variantName && i.variantName !== i.productName
            ? `${i.productName} · ${i.variantName} — ${i.sku}`
            : `${i.productName} — ${i.sku}`,
      })),
    [inventory],
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["inventory", "transfers"] });
    void qc.invalidateQueries({ queryKey: ["dashboard", "inventory"] });
    void qc.invalidateQueries({ queryKey: ["dashboard", "locations"] });
  };

  function addItem() {
    setItems((prev) => [...prev, { id: nextItemId++, variantId: 0, qty: "1" }]);
  }

  function updateItem(id: number, patch: Partial<TransferItemRow>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function onSubmit() {
    if (!from || !to) {
      toast.error("Pick both the source and destination warehouse");
      return;
    }
    if (from === to) {
      toast.error("Source and destination must be different");
      return;
    }
    const payload = items
      .filter((it) => it.variantId > 0)
      .map((it) => ({ variantId: it.variantId, quantity: parseInt(it.qty, 10) || 1 }));
    if (payload.length === 0) {
      toast.error("Add at least one item to transfer");
      return;
    }
    setBusy(true);
    try {
      const res = await createStockTransfer({
        fromLocation: from,
        toLocation: to,
        notes: notes.trim() || undefined,
        items: payload,
      });
      toast.success(`Transfer ${res.transferNumber} completed`);
      setOpen(false);
      setFrom("");
      setTo("");
      setNotes("");
      setItems([]);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Move stock between warehouses. Every transfer is recorded here with its items, route, and
          date.
        </p>
        {!open && (
          <Button
            variant="default"
            className="shrink-0 justify-center"
            onClick={() => {
              setOpen(true);
              if (items.length === 0) addItem();
            }}
          >
            <Plus size={13} /> New transfer
          </Button>
        )}
      </div>

      {open && (
        <Card className="mt-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">New stock transfer</span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto_1fr]">
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">From</span>
              {scopedFrom ? (
                <div className="rounded-lg flex h-9 items-center border border-border bg-surface px-3 text-sm font-medium">
                  {scopedFrom}
                </div>
              ) : (
                <Select value={from} onValueChange={setFrom}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Source warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations
                      .filter((l) => l.isActive && l.name !== to)
                      .map((l) => (
                        <SelectItem key={l.id} value={l.name}>
                          {l.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </label>
            <div className="flex items-end justify-center pb-2 text-muted-foreground">
              <ArrowRight size={16} />
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">To</span>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Destination warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {locations
                    .filter((l) => l.isActive && l.name !== from)
                    .map((l) => (
                      <SelectItem key={l.id} value={l.name}>
                        {l.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="mt-2">
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Notes (optional)</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Monthly restock of flagship inventory"
                className="rounded-md w-full border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground"
              />
            </label>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium">Items</span>
              <Button variant="surface" size="sm" onClick={addItem}>
                <Plus size={12} /> Add item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <SearchSelect
                      options={variantOptions}
                      value={it.variantId ? String(it.variantId) : ""}
                      onChange={(v) => updateItem(it.id, { variantId: Number(v) })}
                      placeholder="Search product / SKU…"
                    />
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) => updateItem(it.id, { qty: e.target.value })}
                    className="rounded-md w-20 border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground"
                  />
                  <button
                    onClick={() => removeItem(it.id)}
                    className="text-muted-foreground hover:text-sale"
                    aria-label="Remove item"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground">No items yet — add the first one.</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setItems([]);
              }}
            >
              Cancel
            </Button>
            <Button variant="default" onClick={() => void onSubmit()} disabled={busy}>
              {busy ? "Transferring…" : "Complete transfer"}
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="mt-6 py-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : transfers.length === 0 ? (
        <div className="mt-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No transfers yet. Move stock between warehouses to build a documented history.
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2 font-medium">Transfer</th>
                <th className="px-3 py-2 font-medium">Route</th>
                <th className="px-3 py-2 font-medium">Items</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t: StockTransfer) => (
                <tr key={t.id} className="border-b border-border last:border-b-0 hover:bg-surface">
                  <td className="px-3 py-2 align-middle font-mono text-xs">{t.transferNumber}</td>
                  <td className="px-3 py-2 align-middle">
                    <span className="font-medium">{t.fromLocation}</span>
                    <ArrowRight size={11} className="mx-1 inline text-muted-foreground" />
                    <span className="font-medium">{t.toLocation}</span>
                  </td>
                  <td className="max-w-[260px] px-3 py-2 align-middle">
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      {t.items.map((it) => (
                        <div key={it.id} className="truncate">
                          {it.quantity}× {it.productName ?? it.variantName ?? it.sku ?? "—"}
                          {it.unitId ? " (unit)" : ""}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 align-middle text-xs text-muted-foreground">
                    {t.notes || "—"}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <Pill tone={t.status === "completed" ? "success" : "muted"}>{t.status}</Pill>
                  </td>
                  <td className="px-3 py-2 align-middle text-xs text-muted-foreground">
                    <div>{new Date(t.createdAt).toLocaleDateString()}</div>
                    <div>{new Date(t.createdAt).toLocaleTimeString()}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
