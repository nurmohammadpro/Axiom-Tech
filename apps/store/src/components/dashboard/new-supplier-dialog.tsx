"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdvanceSelect } from "@/components/ui/advance-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { handleEnterAdvance } from "@/lib/focus-navigation";

export interface CreatedSupplier {
  id: string;
  name: string;
}

interface NewSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional pre-filled name (e.g. what the user typed into the search). */
  initialName?: string;
  onCreated: (supplier: CreatedSupplier) => void;
}

const SUPPLIER_TYPES = [
  { value: "company", label: "Company" },
  { value: "importer", label: "Importer" },
  { value: "individual", label: "Individual" },
];

/**
 * Inline supplier creation for purchase intake: mirrors NewProductDialog —
 * creates the supplier via POST /api/dashboard/suppliers (owner-only) and
 * hands it back so the caller can select it on the line. Full editing
 * (address, NID, opening balance…) stays on the suppliers page.
 */
export function NewSupplierDialog({
  open,
  onOpenChange,
  initialName,
  onCreated,
}: NewSupplierDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("company");
  const [submitting, setSubmitting] = useState(false);

  // Fresh form every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setPhone("");
    setType("company");
  }, [open, initialName]);

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Supplier name is required");
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          phone: phone.trim() || undefined,
          type,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `HTTP ${res.status}`);
        return;
      }
      onCreated({ id: data.id, name: data.name });
      toast.success(`Supplier "${data.name}" created`);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Supplier</DialogTitle>
          <DialogDescription>
            Creates the supplier and selects it for this purchase order. Contact details can be
            filled in later from the Suppliers page.
          </DialogDescription>
        </DialogHeader>

        {/* handleEnterAdvance scopes Enter-advance to the modal fields:
            Name → Phone → Type → submit. */}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <label className="text-[10px] text-muted-foreground">Supplier name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleEnterAdvance}
              placeholder="e.g. Rahim Telecom"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={handleEnterAdvance}
                placeholder="01XXXXXXXXX"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Type</label>
              <AdvanceSelect value={type} onValueChange={setType} placeholder="Select">
                {SUPPLIER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </AdvanceSelect>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              Create &amp; Select
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
