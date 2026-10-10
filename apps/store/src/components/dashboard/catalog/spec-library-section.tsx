"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, Table } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import * as api from "@/lib/api";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

function InlineEdit({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(value);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-56 border border-border bg-background px-2 py-0.5 text-sm outline-none focus:border-foreground"
      />
      <button
        onClick={async () => {
          if (!label.trim() || label === value) return;
          setBusy(true);
          try {
            await onSave(label.trim());
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy || !label.trim() || label === value}
        className="p-0.5 text-primary hover:text-foreground"
      >
        <Check size={14} />
      </button>
      <button onClick={onCancel} className="p-0.5 text-muted-foreground hover:text-foreground">
        <X size={14} />
      </button>
    </div>
  );
}

function AddForm({
  onSave,
  onCancel,
}: {
  onSave: (label: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!label.trim()) return;
        setBusy(true);
        try {
          await onSave(label.trim());
          setLabel("");
          toast.success("Spec label added");
        } catch {
          toast.error("Failed to add spec label");
        } finally {
          setBusy(false);
        }
      }}
      className="mb-3 flex gap-2"
    >
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Spec label (e.g. Processor)"
        className="min-w-0 flex-1 border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground"
      />
      <Button type="submit" variant="default" disabled={busy || !label.trim()}>
        {busy ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="surface" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

export function SpecLibrarySection() {
  const queryClient = useQueryClient();
  const { data: templates = [] } = useQuery({
    queryKey: ["spec-templates"],
    queryFn: () => api.getSpecTemplates(),
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["spec-templates"] });

  const addLabel = async (label: string) => {
    try {
      await api.createSpecTemplate({ label });
      await invalidate();
      setShowForm(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to add spec label");
      throw e;
    }
  };

  const updateLabel = async (id: number, label: string) => {
    try {
      await api.updateSpecTemplate(id, { label });
      await invalidate();
      setEditingId(null);
      toast.success("Spec label updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update spec label");
    }
  };

  const removeLabel = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteSpecTemplate(deleteTarget.id);
      await invalidate();
      setDeleteTarget(null);
      toast.success("Spec label deleted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete spec label");
    }
  };

  return (
    <>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Spec Library</div>
          <Button variant="default" onClick={() => setShowForm(!showForm)}>
            <Plus size={13} /> Add spec label
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Reusable labels shown as a quick-pick in the Add / Edit product forms. Each product still
          gets its own value for a label.
        </p>
        {showForm && (
          <div className="mt-3">
            <AddForm onSave={addLabel} onCancel={() => setShowForm(false)} />
          </div>
        )}
        <div className="mt-3">
          <Table
            columns={["Label", ""]}
            rows={templates.map((t) => [
              editingId === t.id ? (
                <InlineEdit
                  key="edit"
                  value={t.label}
                  onSave={(v) => updateLabel(t.id, v)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                t.label
              ),
              <div key="actions" className="flex gap-1">
                <button
                  onClick={() => setEditingId(t.id)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  title="Edit"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => setDeleteTarget({ id: t.id, label: t.label })}
                  className="p-1 text-muted-foreground hover:text-sale"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>,
            ])}
          />
        </div>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.label}"?`}
        description="This removes the reusable label. Products that already use this label keep their spec rows — only the quick-pick entry is removed."
        confirmLabel="Delete"
        onConfirm={removeLabel}
      />
    </>
  );
}
