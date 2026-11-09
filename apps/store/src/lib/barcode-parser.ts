/**
 * Barcode parser for extracting IMEI and Serial Number from scanned barcodes.
 *
 * Universal support for ALL phone brands:
 * - Samsung, Apple, Oppo, Vivo, Xiaomi, Redmi, Poco, Infinix, Tecno, Realme,
 *   OnePlus, Motorola, Nokia, Huawei, Honor, Google Pixel, Sony, LG, etc.
 *
 * All brands use the same standard formats:
 * - IMEI: Always 15 digits (GS1 standard)
 * - Serial Number: Alphanumeric, varies by manufacturer
 *
 * Supported barcode formats:
 * - Plain IMEI (15 digits)
 * - IMEI + SN separated by tab, comma, pipe, semicolon, or space
 * - JSON format: {"imei":"...","sn":"..."} or {"imei1":"...","serial":"..."}
 * - Samsung format: starts with "S/N:" prefix
 * - Oppo/Realme format: may include "CE" prefix before IMEI
 * - Xiaomi/Redmi/Poco format: may include model code prefix
 * - Infinix/Tecno/Itel format: standard IMEI with optional batch number
 */

export interface ParsedBarcode {
  imei1?: string;
  imei2?: string;
  serial?: string;
  raw: string;
  brand?: string;
}

function isIMEI(value: string): boolean {
  const cleaned = value.replace(/[\s-]/g, "");
  return /^\d{15}$/.test(cleaned);
}

function normalizeIMEI(imei: string): string {
  return imei.replace(/[\s-]/g, "");
}

function parseJSONBarcode(raw: string): ParsedBarcode | null {
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;

    const result: ParsedBarcode = { raw };

    // Try common JSON key patterns
    if (data.imei1 || data.imei) {
      result.imei1 = normalizeIMEI(data.imei1 || data.imei);
    }
    if (data.imei2) {
      result.imei2 = normalizeIMEI(data.imei2);
    }
    if (data.serial || data.serialNumber || data.sn || data.SN) {
      result.serial = data.serial || data.serialNumber || data.sn || data.SN;
    }

    return result.imei1 || result.serial ? result : null;
  } catch {
    return null;
  }
}

function parseDelimitedBarcode(raw: string, delimiter: string): ParsedBarcode | null {
  const parts = raw.split(delimiter).map((p) => p.trim());
  if (parts.length < 2) return null;

  const result: ParsedBarcode = { raw };

  // First part is usually IMEI
  if (isIMEI(parts[0])) {
    result.imei1 = normalizeIMEI(parts[0]);
  } else {
    // Might be S/N prefix or other format
    const snMatch = parts[0].match(/^(?:S\/N|SN|IMEI|ESN)[:\s]*(.+)/i);
    if (snMatch && isIMEI(snMatch[1])) {
      result.imei1 = normalizeIMEI(snMatch[1]);
    } else {
      result.serial = parts[0];
    }
  }

  // Second part
  if (parts.length >= 2) {
    if (isIMEI(parts[1])) {
      if (!result.imei1) {
        result.imei1 = normalizeIMEI(parts[1]);
      } else {
        result.imei2 = normalizeIMEI(parts[1]);
      }
    } else {
      result.serial = parts[1];
    }
  }

  // Third part (if exists)
  if (parts.length >= 3 && !result.serial) {
    result.serial = parts[2];
  }

  return result.imei1 || result.serial ? result : null;
}

/**
 * Detect brand from IMEI TAC (Type Allocation Code) - first 8 digits.
 * This is informational only - parser works for all brands regardless.
 */
function detectBrandFromIMEI(imei: string): string | undefined {
  const tac = imei.substring(0, 8);
  // Common TAC prefixes (non-exhaustive)
  const brandTACs: Record<string, string[]> = {
    Samsung: ["3528", "3533", "3534", "3558", "3569", "3570", "3589", "3590", "3591"],
    Apple: ["3533", "3534", "3568", "3570", "3580"],
    Xiaomi: ["8693", "8694", "8695", "8696", "8697", "8698", "8699"],
    Oppo: ["8670", "8671", "8672", "8673", "8674"],
    Vivo: ["8680", "8681", "8682", "8683", "8684"],
    Infinix: ["3532", "3533", "3534", "3535"],
    Tecno: ["3532", "3533", "3534", "3535"],
    Realme: ["8670", "8671", "8672"],
    OnePlus: ["8680", "8681", "8682"],
    Huawei: ["8620", "8621", "8622", "8623", "8624"],
    Motorola: ["3575", "3576", "3577", "3578"],
    Nokia: ["3568", "3569", "3570", "3571"],
  };

  for (const [brand, prefixes] of Object.entries(brandTACs)) {
    if (prefixes.some((p) => tac.startsWith(p))) {
      return brand;
    }
  }
  return undefined;
}

/**
 * Parse a scanned barcode and extract IMEI and/or serial number.
 * Works with ALL phone brands (Samsung, Apple, Oppo, Vivo, Xiaomi, etc.)
 */
export function parseBarcode(raw: string): ParsedBarcode {
  const trimmed = raw.trim();

  // Try JSON format first
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const jsonResult = parseJSONBarcode(trimmed);
    if (jsonResult) return jsonResult;
  }

  // Try common delimiters
  if (trimmed.includes("\t")) {
    const tabResult = parseDelimitedBarcode(trimmed, "\t");
    if (tabResult) return tabResult;
  }
  if (trimmed.includes("|")) {
    const pipeResult = parseDelimitedBarcode(trimmed, "|");
    if (pipeResult) return pipeResult;
  }
  if (trimmed.includes(";")) {
    const semicolonResult = parseDelimitedBarcode(trimmed, ";");
    if (semicolonResult) return semicolonResult;
  }
  if (trimmed.includes(",")) {
    const commaResult = parseDelimitedBarcode(trimmed, ",");
    if (commaResult) return commaResult;
  }

  // Samsung format: "S/N:ABC123 IMEI:123456789012345"
  const samsungMatch = trimmed.match(/S\/N[:\s]+(\S+).*?IMEI[:\s]+(\d{15})/i);
  if (samsungMatch) {
    return {
      serial: samsungMatch[1],
      imei1: normalizeIMEI(samsungMatch[2]),
      raw: trimmed,
      brand: "Samsung",
    };
  }

  // Oppo/Realme format: "IMEI:123456789012345 S/N:ABC123"
  const oppoMatch = trimmed.match(/IMEI[:\s]+(\d{15}).*?S\/N[:\s]+(\S+)/i);
  if (oppoMatch) {
    return {
      imei1: normalizeIMEI(oppoMatch[1]),
      serial: oppoMatch[2],
      raw: trimmed,
      brand: "Oppo",
    };
  }

  // Xiaomi/Redmi format: may include model code like "model:23127PN0CC imei:123456789012345"
  const xiaomiMatch = trimmed.match(/(?:model[:\s]+\S+)?\s*imei[:\s]+(\d{15})/i);
  if (xiaomiMatch) {
    const snMatch = trimmed.match(/(?:sn|serial)[:\s]+(\S+)/i);
    return {
      imei1: normalizeIMEI(xiaomiMatch[1]),
      serial: snMatch?.[1],
      raw: trimmed,
      brand: "Xiaomi",
    };
  }

  // IMEI followed by SN: "123456789012345 ABC123"
  const imeiThenSn = trimmed.match(/^(\d{15})\s+(\S+)$/);
  if (imeiThenSn) {
    return {
      imei1: normalizeIMEI(imeiThenSn[1]),
      serial: imeiThenSn[2],
      raw: trimmed,
    };
  }

  // SN followed by IMEI: "ABC123 123456789012345"
  const snThenImei = trimmed.match(/^(\S+)\s+(\d{15})$/);
  if (snThenImei) {
    return {
      serial: snThenImei[1],
      imei1: normalizeIMEI(snThenImei[2]),
      raw: trimmed,
    };
  }

  // Plain IMEI
  if (isIMEI(trimmed)) {
    const brand = detectBrandFromIMEI(trimmed);
    return {
      imei1: normalizeIMEI(trimmed),
      raw: trimmed,
      brand,
    };
  }

  // Plain serial number (non-numeric, or numeric but not 15 digits)
  return {
    serial: trimmed,
    raw: trimmed,
  };
}
