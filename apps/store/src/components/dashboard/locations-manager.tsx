"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Pill } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { useLocations } from "@/lib/hooks";
import { createLocation, deleteLocation, updateLocation, type Location } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { MapPin, Pencil, Plus, Trash2, X } from "lucide-react";

const inputCls =
  "w-full border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground";

/** Full CRUD manager for warehouses/locations — reused in Settings and Inventory. */
export function LocationsManager() {
  const qc = useQueryClient();
  const { data: locations = [], isLoading } = useLocations();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["dashboard", "locations"] });

  const resetForm = () => setForm({ name: "", code: "", address: "", phone: "" });

  async function onSave() {
    if (!form.name.trim()) {
      toast.error("Location name is required");
      return;
    }
    setBusy(true);
    try {
      if (editingId != null) {
        await updateLocation(editingId, form);
        toast.success("Location updated");
      } else {
        await createLocation(form);
        toast.success("Location created");
      }
      setAdding(false);
      setEditingId(null);
      resetForm();
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSetDefault(loc: Location) {
    setBusy(true);
    try {
      // Optimistically update UI first
      qc.setQueryData<Location[]>(["dashboard", "locations"], (old) =>
        old?.map((l) => ({ ...l, isDefault: l.id === loc.id })),
      );
      await updateLocation(loc.id, { isDefault: true });
      toast.success(`${loc.name} is now the default location`);
    } catch (e) {
      // Revert optimistic update on failure
      void qc.invalidateQueries({ queryKey: ["dashboard", "locations"] });
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(loc: Location) {
    setDeleteTarget(loc);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteLocation(deleteTarget.id);
      toast.success("Location deleted");
      refresh();
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(loc: Location) {
    setEditingId(loc.id);
    setAdding(false);
    setForm({
      name: loc.name,
      code: loc.code,
      address: loc.address ?? "",
      phone: loc.phone ?? "",
    });
  }

  const cancelEdit = () => {
    setEditingId(null);
    setAdding(false);
    resetForm();
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Warehouses & outlets where stock is received, stored, and sold. Create as many as you need
          — stock can be transferred between them.
        </p>
        {!adding && editingId == null && (
          <Button
            variant="default"
            className="shrink-0 justify-center"
            onClick={() => {
              setAdding(true);
              resetForm();
            }}
          >
            <Plus size={13} /> Add location
          </Button>
        )}
      </div>

      {(adding || editingId != null) && (
        <Card className="mt-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              {editingId != null ? "Edit location" : "New location"}
            </span>
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Name *</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Warehouse C"
                className={inputCls}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Code</span>
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="auto (WH-…)"
                className={inputCls}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Address</span>
              <input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Street, city"
                className={inputCls}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Phone</span>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Contact number"
                className={inputCls}
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={cancelEdit}>
              Cancel
            </Button>
            <Button variant="default" onClick={() => void onSave()} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="mt-6 py-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : locations.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 py-10 text-center">
          <MapPin size={20} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No locations yet. Add your first warehouse to start receiving stock.
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Address</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr
                  key={loc.id}
                  className="border-b border-border last:border-b-0 hover:bg-surface"
                >
                  <td className="px-3 py-2 align-middle font-mono text-xs text-muted-foreground">
                    {loc.code}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <span className="font-medium">{loc.name}</span>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 align-middle text-muted-foreground">
                    {loc.address || "—"}
                  </td>
                  <td className="px-3 py-2 align-middle text-muted-foreground">
                    {loc.phone || "—"}
                  </td>
                  <td className="px-3 py-2 align-middle text-xs text-muted-foreground">
                    {loc.skuCount ?? 0} SKUs · {loc.unitCount ?? 0} units
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <Pill tone={loc.isActive ? "success" : "muted"}>
                      {loc.isActive ? "Active" : "Inactive"}
                    </Pill>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(loc)}
                        className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => void onDelete(loc)}
                        className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-sale"
                        title="Delete"
                        disabled={busy}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete location"
          description={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
