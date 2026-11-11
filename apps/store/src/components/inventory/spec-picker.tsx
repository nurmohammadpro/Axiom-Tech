"use client";

import { useState } from "react";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

export interface Spec {
  label: string;
  value: string;
}

export function SpecPicker({
  specs,
  onChange,
}: {
  specs: Spec[];
  onChange: (specs: Spec[]) => void;
}) {
  const [templates, setTemplates] = useState<{ id: number; label: string }[]>([]);
  const [pickedSpec, setPickedSpec] = useState("");

  // Load templates on first interaction
  const loadTemplates = () => {
    if (templates.length === 0) {
      fetch("/api/spec-templates")
        .then((r) => r.json())
        .then(setTemplates)
        .catch(() => {});
    }
  };

  const addSpec = () => onChange([...specs, { label: "", value: "" }]);

  const updateSpec = (index: number, field: "label" | "value", val: string) =>
    onChange(specs.map((s, i) => (i === index ? { ...s, [field]: val } : s)));

  const removeSpec = (index: number) => onChange(specs.filter((_, i) => i !== index));

  const addFromTemplate = () => {
    const label = pickedSpec.trim();
    if (!label) return;
    const exists = specs.some((s) => s.label.trim().toLowerCase() === label.toLowerCase());
    if (exists) {
      toast.info("Spec label already added");
    } else {
      onChange([...specs, { label, value: "" }]);
      toast.success(`Added "${label}"`);
    }
    setPickedSpec("");
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Specifications</div>
        <Button type="button" onClick={addSpec} variant="surface">
          <Plus size={13} /> Add specification
        </Button>
      </div>

      <div onMouseEnter={loadTemplates} onFocus={loadTemplates}>
        {templates.length > 0 && (
          <div className="mt-3 flex items-center gap-2 border border-border bg-surface p-2">
            <Select value={pickedSpec} onValueChange={setPickedSpec}>
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue placeholder="Pick a spec…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.label}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="default" onClick={addFromTemplate} disabled={!pickedSpec}>
              Add
            </Button>
          </div>
        )}
      </div>

      {specs.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Add product specifications like "Processor", "Display", "Battery" with formatted values.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {specs.map((spec, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Spec {i + 1}</span>
              <button
                type="button"
                onClick={() => removeSpec(i)}
                className="text-muted-foreground hover:text-sale"
              >
                <X size={13} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Label
                </label>
                <input
                  value={spec.label}
                  onChange={(e) => updateSpec(i, "label", e.target.value)}
                  placeholder="e.g. Processor"
                  className="rounded-md w-full border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Value
                </label>
                <textarea
                  value={spec.value}
                  onChange={(e) => updateSpec(i, "value", e.target.value)}
                  placeholder="e.g. A18 Pro chip **with 6-core GPU**"
                  rows={2}
                  className="rounded-md w-full border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Use **bold** for emphasis. Lines starting with - become bullet lists.
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Card>
  );
}
