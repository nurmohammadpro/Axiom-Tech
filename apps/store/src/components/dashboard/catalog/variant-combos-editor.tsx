"use client";

import { X } from "lucide-react";

/**
 * Simplified variant editor shared by the catalog Add/Edit pages: two fixed
 * axes ("Storage" and "Color") as comma-separated inputs, with the storage ×
 * color combos auto-generated into one editable row per variant. Variants
 * whose attributes don't fit the two axes (legacy data) render under
 * "Other attribute variants" and are saved verbatim.
 */

export interface ComboValues {
  cost: string;
  sell: string;
  qty: string;
}

export const EMPTY_COMBO_VALUES: ComboValues = { cost: "", sell: "", qty: "0" };

export interface ComboRow {
  key: string; // comboKey(storage, color), e.g. "128GB|Black"
  storage: string | null; // null when that axis is unused
  color: string | null;
  label: string; // "128GB / Black"
  values: ComboValues;
}

export interface LegacyVariantRow {
  key: string;
  label: string;
  attrs: { name: string; value: string }[]; // original attribute array, saved verbatim
  values: ComboValues;
}

/** Split a comma-separated axis input into deduped, trimmed values. */
export function parseAxis(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
}

/** Stable identity for a storage × color combination. */
export function comboKey(storage: string | null, color: string | null): string {
  return `${storage ?? ""}|${color ?? ""}`;
}

/**
 * Cartesian product of the two axes. An empty axis contributes a single null
 * so single-axis products still get one row per value of the other axis.
 * Entered prices/qty survive axis edits via the `saved` map keyed by combo
 * key — stale keys are harmless because submission iterates rows, not keys.
 */
export function buildComboRows(
  storageVals: string[],
  colorVals: string[],
  saved: Record<string, ComboValues>,
): ComboRow[] {
  const rows: ComboRow[] = [];
  const storages = storageVals.length > 0 ? storageVals : [null];
  const colors = colorVals.length > 0 ? colorVals : [null];
  for (const s of storages) {
    for (const c of colors) {
      const key = comboKey(s, c);
      rows.push({
        key,
        storage: s,
        color: c,
        label: [s, c].filter(Boolean).join(" / "),
        values: saved[key] ?? EMPTY_COMBO_VALUES,
      });
    }
  }
  return rows;
}

const numberInputClass =
  "w-full border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground";

interface VariantCombosEditorProps {
  storageInput: string;
  colorInput: string;
  onStorageInputChange: (v: string) => void;
  onColorInputChange: (v: string) => void;
  rows: ComboRow[];
  legacyRows?: LegacyVariantRow[];
  onFieldChange: (key: string, field: keyof ComboValues, value: string) => void;
  onLegacyFieldChange?: (key: string, field: "cost" | "sell", value: string) => void;
  onLegacyRemove?: (key: string) => void;
  isOwner: boolean;
  /** Accessories can stock-keep per variant; devices are always 0 until received. */
  showQty: boolean;
}

export function VariantCombosEditor({
  storageInput,
  colorInput,
  onStorageInputChange,
  onColorInputChange,
  rows,
  legacyRows = [],
  onFieldChange,
  onLegacyFieldChange,
  onLegacyRemove,
  isOwner,
  showQty,
}: VariantCombosEditorProps) {
  // Combo label gets the flexible column; each price/qty column is fixed width.
  const gridStyle = {
    gridTemplateColumns: [
      "minmax(0,1fr)",
      ...(isOwner ? ["110px"] : []),
      "110px",
      ...(showQty ? ["80px"] : []),
    ].join(" "),
  };

  const legacyGridStyle = {
    gridTemplateColumns: ["minmax(0,1fr)", ...(isOwner ? ["110px"] : []), "110px", "28px"].join(
      " ",
    ),
  };

  return (
    <div className="space-y-4">
      {/* Axis definitions */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
            Storage values (comma-separated)
          </label>
          <input
            value={storageInput}
            onChange={(e) => onStorageInputChange(e.target.value)}
            placeholder="e.g. 128GB, 256GB"
            className="rounded-md w-full border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
            Color values (comma-separated)
          </label>
          <input
            value={colorInput}
            onChange={(e) => onColorInputChange(e.target.value)}
            placeholder="e.g. Black, Blue"
            className="rounded-md w-full border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground"
          />
        </div>
      </div>

      {/* Generated combos */}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Enter Storage and/or Color values to generate variants — each combination becomes one
          variant (e.g. &quot;128GB / Black&quot;).
        </p>
      ) : (
        <div>
          <div
            className="mb-1 grid items-end gap-2 text-[10px] uppercase tracking-widest text-muted-foreground"
            style={gridStyle}
          >
            <span>Variant</span>
            {isOwner && <span>Cost</span>}
            <span>Sell price</span>
            {showQty && <span>Qty</span>}
          </div>
          <div className="space-y-1.5">
            {rows.map((row) => (
              <div key={row.key} className="grid items-center gap-2" style={gridStyle}>
                <div
                  className="rounded-md truncate border border-border bg-surface px-2 py-1.5 text-sm"
                  title={row.label}
                >
                  {row.label}
                </div>
                {isOwner && (
                  <input
                    type="number"
                    value={row.values.cost}
                    onChange={(e) => onFieldChange(row.key, "cost", e.target.value)}
                    placeholder="0.00"
                    className={numberInputClass}
                  />
                )}
                <input
                  type="number"
                  value={row.values.sell}
                  onChange={(e) => onFieldChange(row.key, "sell", e.target.value)}
                  placeholder="0.00"
                  className={numberInputClass}
                />
                {showQty && (
                  <input
                    type="number"
                    value={row.values.qty}
                    onChange={(e) => onFieldChange(row.key, "qty", e.target.value)}
                    placeholder="0"
                    className={numberInputClass}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Variants stored under attribute names other than Storage/Color */}
      {legacyRows.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Other attribute variants
          </div>
          <div className="space-y-1.5">
            {legacyRows.map((row) => (
              <div key={row.key} className="grid items-center gap-2" style={legacyGridStyle}>
                <div
                  className="rounded-md truncate border border-border bg-surface px-2 py-1.5 text-sm"
                  title={row.label}
                >
                  {row.label}
                </div>
                {isOwner && (
                  <input
                    type="number"
                    value={row.values.cost}
                    onChange={(e) => onLegacyFieldChange?.(row.key, "cost", e.target.value)}
                    placeholder="0.00"
                    className={numberInputClass}
                  />
                )}
                <input
                  type="number"
                  value={row.values.sell}
                  onChange={(e) => onLegacyFieldChange?.(row.key, "sell", e.target.value)}
                  placeholder="0.00"
                  className={numberInputClass}
                />
                <button
                  type="button"
                  onClick={() => onLegacyRemove?.(row.key)}
                  className="text-muted-foreground hover:text-sale"
                  title="Remove variant"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
