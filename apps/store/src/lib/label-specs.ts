/**
 * Shared device-specs logic for barcode labels.
 *
 * Specs come from the catalog in two forms — variant attributes (Storage,
 * Color; per variant) and product specs (RAM etc.; product-level) — already
 * merged into LabelData.specs by the barcodes API. This module holds the one
 * show/hide filter used by the canvas renderer, the TSPL/QR renderer and the
 * settings UI, so all three agree on what appears on the label.
 *
 * Kept free of DOM and printer imports so both renderers (and the UI) can
 * share it without an import cycle between label-render.ts and tspl.ts.
 */

export interface LabelSpec {
  label: string;
  value: string;
}

/** Normalized key for a spec label (" Storage " and "storage" are the same spec). */
export const specKey = (label: string) => label.trim().toLowerCase();

/**
 * Values shown on the label, in order. A spec is hidden only when the master
 * toggle is off, its key is explicitly false in specVisibility (missing = shown,
 * matching the default-on behavior of every other label toggle), or its value
 * is empty.
 */
export function visibleSpecValues(
  specs: LabelSpec[] | undefined,
  opts: { showSpecs?: boolean; specVisibility?: Record<string, boolean> },
): string[] {
  if (opts.showSpecs === false || !specs?.length) return [];
  const vis = opts.specVisibility ?? {};
  const out: string[] = [];
  for (const s of specs) {
    const v = (s.value ?? "").trim();
    if (!v) continue;
    if (vis[specKey(s.label)] === false) continue;
    out.push(v);
  }
  return out;
}

/** The single text line drawn on the label, e.g. "8GB  ·  256GB  ·  Black". */
export function specsLineText(
  specs: LabelSpec[] | undefined,
  opts: { showSpecs?: boolean; specVisibility?: Record<string, boolean> },
): string {
  return visibleSpecValues(specs, opts).join("  ·  ");
}
