"use client";

import { useRef, useState } from "react";
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
import { UnitGrid, type UnitRow, createEmptyUnit } from "./unit-grid";
import { useSessionScope } from "@/lib/hooks";
import { isUnitTracked } from "@/lib/product-tracking";

export interface Dimension {
  name: string;
  values: string[];
}

export interface ManualVariant {
  id: number;
  attrs: Record<string, string>;
  cost: string;
  sell: string;
  qty: string;
  units: UnitRow[];
}

interface LocationData {
  id: number;
  name: string;
  code: string;
  isDefault: boolean;
  isActive: boolean;
}

export function VariantEditor({
  productType,
  trackUnits,
  hasVariants,
  onHasVariantsChange,
  dimensions,
  onDimensionsChange,
  manualVariants,
  onVariantsChange,
  deviceUnits,
  onDeviceUnitsChange,
  quantity,
  onQuantityChange,
  sellingPrice,
  location,
  onLocationChange,
}: {
  productType: "new" | "accessory";
  trackUnits?: boolean;
  hasVariants: boolean;
  onHasVariantsChange: (v: boolean) => void;
  dimensions: Dimension[];
  onDimensionsChange: (d: Dimension[]) => void;
  manualVariants: ManualVariant[];
  onVariantsChange: (v: ManualVariant[]) => void;
  deviceUnits: UnitRow[];
  onDeviceUnitsChange: (u: UnitRow[]) => void;
  quantity: string;
  onQuantityChange: (q: string) => void;
  sellingPrice: string;
  location: string;
  onLocationChange: (l: string) => void;
}) {
  const { data: session } = useSessionScope();
  const userRole = session?.staffRole || session?.role || "customer";
  const isOwner = userRole === "owner";
  const nextVariantId = useRef(1);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [rawValues, setRawValues] = useState<Record<number, string>>({});

  // Load locations once
  useState(() => {
    fetch("/api/dashboard/locations")
      .then((r) => r.json())
      .then((rows: LocationData[]) => {
        const active = rows.filter((l) => l.isActive);
        setLocations(active);
        if (!location) {
          const def = rows.find((l) => l.isDefault) ?? rows[0];
          if (def) onLocationChange(def.name);
        }
      })
      .catch(() => {});
  });

  const addDimension = () => onDimensionsChange([...dimensions, { name: "", values: [] }]);

  const updateDimension = (index: number, field: "name" | "values", value: string) => {
    onDimensionsChange(
      dimensions.map((d, i) =>
        i === index
          ? {
              ...d,
              [field]:
                field === "values"
                  ? value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean)
                  : value,
            }
          : d,
      ),
    );
  };

  const removeDimension = (index: number) => {
    onDimensionsChange(dimensions.filter((_, i) => i !== index));
    onVariantsChange([]);
    setRawValues({});
  };

  const addVariant = () => {
    onVariantsChange([
      ...manualVariants,
      {
        id: nextVariantId.current++,
        attrs: {},
        cost: "",
        sell: sellingPrice,
        qty: "0",
        units: [],
      },
    ]);
  };

  const updateVariantAttr = (id: number, dimName: string, value: string) => {
    onVariantsChange(
      manualVariants.map((v) =>
        v.id === id ? { ...v, attrs: { ...v.attrs, [dimName]: value } } : v,
      ),
    );
  };

  const updateVariantField = (id: number, field: "cost" | "sell" | "qty", value: string) => {
    onVariantsChange(manualVariants.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  };

  const updateVariantUnits = (id: number, units: UnitRow[]) => {
    onVariantsChange(manualVariants.map((v) => (v.id === id ? { ...v, units } : v)));
  };

  const removeVariant = (id: number) => {
    onVariantsChange(manualVariants.filter((v) => v.id !== id));
  };

  const hasDefinedDimensions = dimensions.filter((d) => d.name && d.values.length > 0).length > 0;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium">Variants</div>
          {locations.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Receive into
              </label>
              <Select value={location} onValueChange={onLocationChange}>
                <SelectTrigger className="h-7 w-52 text-xs">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.name}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={hasVariants}
            onChange={(e) => {
              onHasVariantsChange(e.target.checked);
              if (!e.target.checked) {
                onDimensionsChange([]);
                onVariantsChange([]);
              }
            }}
            className="h-3.5 w-3.5"
          />
          This product has variants
        </label>
      </div>

      {!hasVariants && (
        <div className="mt-3">
          {isUnitTracked({ productType, trackUnits }) ? (
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Serialized units
              </label>
              <UnitGrid rows={deviceUnits} onChange={onDeviceUnitsChange} />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Quantity
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => onQuantityChange(e.target.value)}
                placeholder="0"
                className="w-full border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
              />
            </div>
          )}
        </div>
      )}

      {hasVariants && (
        <div className="mt-3 space-y-4">
          {/* Dimension definitions */}
          <div>
            <Button type="button" onClick={addDimension} variant="surface">
              <Plus size={13} /> Add dimension
            </Button>

            {dimensions.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Define attribute types — e.g. "Storage" with values "128GB, 256GB". Then add
                individual variants with prices and quantities.
              </p>
            )}

            {dimensions.map((dim, i) => (
              <Card key={i} className="mt-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Dimension {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeDimension(i)}
                    className="text-muted-foreground hover:text-sale"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                      Name
                    </label>
                    <input
                      value={dim.name}
                      onChange={(e) => updateDimension(i, "name", e.target.value)}
                      placeholder="e.g. Storage"
                      className="w-full border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                      Values (comma-separated)
                    </label>
                    <input
                      value={i in rawValues ? rawValues[i] : dim.values.join(", ")}
                      onChange={(e) => {
                        setRawValues((prev) => ({ ...prev, [i]: e.target.value }));
                        const parsed = e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean);
                        if (parsed.length > 0) {
                          onDimensionsChange(
                            dimensions.map((d, idx) => (idx === i ? { ...d, values: parsed } : d)),
                          );
                        }
                      }}
                      onBlur={() => {
                        setRawValues((prev) => {
                          const next = { ...prev };
                          delete next[i];
                          return next;
                        });
                      }}
                      placeholder="e.g. 128GB, 256GB"
                      className="w-full border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Manual variant list */}
          {hasDefinedDimensions && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {manualVariants.length > 0
                    ? `${manualVariants.length} variant${manualVariants.length > 1 ? "s" : ""} defined`
                    : "Define your variants"}
                </span>
                <Button type="button" onClick={addVariant} variant="surface">
                  <Plus size={13} /> Add variant
                </Button>
              </div>
              <div className="space-y-2">
                {manualVariants.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Click "Add variant" to create a specific combination.
                  </p>
                )}
                {manualVariants.map((v) => (
                  <Card key={v.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        {dimensions
                          .filter((d) => d.name)
                          .map((dim) => (
                            <Select
                              key={dim.name}
                              value={v.attrs[dim.name] || ""}
                              onValueChange={(val) => updateVariantAttr(v.id, dim.name, val)}
                            >
                              <SelectTrigger className="h-8 min-w-[110px] text-xs">
                                <SelectValue placeholder={`${dim.name}…`} />
                              </SelectTrigger>
                              <SelectContent>
                                {dim.values.map((val) => (
                                  <SelectItem key={val} value={val}>
                                    {val}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVariant(v.id)}
                        className="text-muted-foreground hover:text-sale"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {isOwner && (
                        <div>
                          <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                            Cost
                          </label>
                          <input
                            type="number"
                            value={v.cost}
                            onChange={(e) => updateVariantField(v.id, "cost", e.target.value)}
                            placeholder="0.00"
                            className="w-full border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                          />
                        </div>
                      )}
                      <div>
                        <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                          Sell price
                        </label>
                        <input
                          type="number"
                          value={v.sell}
                          onChange={(e) => updateVariantField(v.id, "sell", e.target.value)}
                          placeholder="0.00"
                          className="w-full border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                        />
                      </div>
                    </div>
                    {isUnitTracked({ productType, trackUnits }) ? (
                      <div className="mt-2">
                        <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                          Serialized units
                        </label>
                        <UnitGrid
                          rows={v.units}
                          onChange={(rows) => updateVariantUnits(v.id, rows)}
                        />
                      </div>
                    ) : (
                      <div className="mt-2">
                        <label className="mb-0.5 block text-[10px] uppercase tracking-widest text-muted-foreground">
                          Qty
                        </label>
                        <input
                          type="number"
                          value={v.qty}
                          onChange={(e) => updateVariantField(v.id, "qty", e.target.value)}
                          placeholder="0"
                          className="w-full border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                        />
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
