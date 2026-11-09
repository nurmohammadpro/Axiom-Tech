import { randomBytes, createHash } from "crypto";

const rand = () => randomBytes(4).toString("hex").toUpperCase();

/**
 * Generate a short 12-digit numeric barcode for receipts.
 * Format: YYMMDD + 6 random digits = 12 digits total.
 * Pure digits scan reliably with CODE128.
 * e.g. "260817001234"
 */
export function generateBarcodeNumber(date = new Date()): string {
  const y = String(date.getFullYear()).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 999999)).padStart(6, "0");
  return `${y}${m}${d}${seq}`;
}

export function nextSaleNumber(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `SAL-${y}${m}${d}-${rand()}`;
}

export function nextInvoiceNumber(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `INV-${y}${m}${d}-${rand()}`;
}

export function nextExchangeNumber(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `EXC-${y}${m}${d}-${rand()}`;
}

export function nextBatchNumber(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `BATCH-${y}${m}${d}-${rand()}`;
}

export function nextTransferNumber(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `TRF-${y}${m}${d}-${rand()}`;
}

/**
 * Abbreviate a label into a short human-readable code:
 * - words with digits stay meaningful ("s24" → "S24", "400" → "400", "256gb" → "256G")
 * - plain words contribute their first letter ("ultra" → "U")
 * e.g. "S24 Ultra" → "S24U", "Honor 400" → "400", "Midnight Blue" → "MB".
 */
function abbreviate(value: string, max = 6): string {
  const words = value
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);
  const code = words
    .map((w) => {
      if (w.length <= 4 && /[0-9]/.test(w)) return w;
      if (w.length > 4 && /^[0-9]/.test(w)) return w.slice(0, 4);
      return w[0];
    })
    .join("")
    .replace(/[^a-z0-9]/g, "");
  return (code || "X").slice(0, max).toUpperCase();
}

/**
 * Short, unique, meaningful SKU: BRAND-MODEL[-VARIANT]-SUFFIX.
 * e.g. "HON-400-31AD" (Honor 400), "SAM-S24U-256G-UHQV" (Samsung S24 Ultra 256GB).
 * The suffix is a deterministic slice of the product id, so every SKU stays unique.
 */
export function generateSku(opts: {
  productName: string;
  productId: string;
  variantName?: string;
  attributes?: { name: string; value: string }[];
  brand?: string | null;
}): string {
  const { productName, productId, variantName, attributes, brand } = opts;
  const brandCode =
    (brand || "GEN")
      .replace(/[^a-z]/gi, "")
      .slice(0, 3)
      .toUpperCase() || "GEN";

  let model = productName.trim();
  if (brand && model.toLowerCase().startsWith(brand.toLowerCase())) {
    model = model.slice(brand.length).trim();
  }
  const modelCode = abbreviate(model, 8);

  const attrValues = (attributes ?? [])
    .map((a) => a.value)
    .filter(Boolean)
    .join(" ");
  const variantSource =
    variantName && variantName.trim().toLowerCase() !== "default" ? variantName : attrValues || "";
  const variantCode = variantSource ? abbreviate(variantSource, 4) : "";
  const suffix =
    productId
      .replace(/[^a-z0-9]/gi, "")
      .slice(-4)
      .toUpperCase() || "XXXX";

  return `${brandCode}-${modelCode}${variantCode ? `-${variantCode}` : ""}-${suffix}`;
}

export function generateVerificationToken(): { raw: string; hash: string } {
  const raw = randomBytes(16).toString("base64url");
  return { raw, hash: hashVerificationToken(raw) };
}

export function hashVerificationToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generate a unified verification number for both POS sales and online orders
 * Format: VER-YYYYMMDD-XXXXXXXX (12 characters, scannable)
 * VER = Verification prefix
 * YYYYMMDD = Date
 * XXXXXXXX = Random hex (8 characters)
 */
export function generateVerificationNumber(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const random = randomBytes(4).toString("hex").toUpperCase();
  return `VER-${y}${m}${d}-${random}`;
}

/**
 * Canonical form for duplicate checks: trimmed + lowercased, so " NIKE ",
 * "NIKE" and "nike" all collapse to the same name. Mirrors the SQL
 * `lower(btrim(name))` used by the DB-level unique indexes and lookups.
 */
export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}
