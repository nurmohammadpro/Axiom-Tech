/**
 * EAN-13 Barcode Generator
 * Generates valid EAN-13 barcode numbers for internal use
 */

/**
 * Generate a valid EAN-13 checksum digit
 */
function calculateEAN13Checksum(code: string): number {
  const digits = code.split("").map(Number);
  let sum = 0;

  for (let i = 0; i < 12; i++) {
    const digit = digits[i];
    // Odd positions (1, 3, 5, 7, 9, 11) are multiplied by 1
    // Even positions (2, 4, 6, 8, 10, 12) are multiplied by 3
    const multiplier = (i + 1) % 2 === 0 ? 3 : 1;
    sum += digit * multiplier;
  }

  const checksum = (10 - (sum % 10)) % 10;
  return checksum;
}

/**
 * Generate a unique EAN-13 barcode
 * Format: 8941170030164 (13 digits)
 * - Prefix: 894 (Bangladesh country code for retail)
 * - Company: 11700 (Your company identifier)
 * - Product: 3016 (Sequential product number)
 * - Checksum: 4 (Calculated checksum digit)
 */
export function generateEAN13Barcode(productId: string, variantIndex: number = 0): string {
  // Use a simple hash of the product ID to generate consistent product codes
  let productHash = 0;
  for (let i = 0; i < productId.length; i++) {
    const char = productId.charCodeAt(i);
    productHash = (productHash << 5) - productHash + char;
    productHash = productHash & productHash; // Convert to 32bit integer
  }

  // Build EAN-13 barcode structure:
  // - 3 digits: Country code (894 = Bangladesh)
  // - 5 digits: Company prefix (11700)
  // - 4 digits: Product item number (including variant)
  // - 1 digit: Checksum

  const productBase = Math.abs(productHash % 100); // 0-99 for product base (2 digits)
  const variantOffset = variantIndex % 100; // 0-99 for variants (2 digits)
  const itemNumber = String(productBase).padStart(2, "0") + String(variantOffset).padStart(2, "0"); // 4 digits total

  const first12 = "894" + "11700" + itemNumber; // 3 + 5 + 4 = 12 digits

  // Calculate and append checksum
  const checksum = calculateEAN13Checksum(first12);

  return first12 + checksum;
}

/**
 * Generate an EAN-13 barcode that is verified unique before use. The legacy
 * generator derived its item number from a product-name hash — a ~10k space,
 * which is why 89 of its barcodes ended up on 367 variants. New barcodes draw
 * a random 4-digit item number under the same 89411700 company prefix and the
 * caller checks it against existing variants before accepting.
 */
export async function generateUniqueEAN13Barcode(
  isTaken: (barcode: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const itemNumber = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const first12 = "894" + "11700" + itemNumber;
    const barcode = first12 + calculateEAN13Checksum(first12);
    if (!(await isTaken(barcode))) return barcode;
  }
  throw new Error("Could not generate a unique barcode after 50 attempts");
}

/**
 * Generate a unique identity code for a single physical inventory unit that has
 * no manufacturer serial (bulk accessories). Format: PSU-{variantId}-{seq:6},
 * e.g. PSU-482-000041. Printed as Code-128 — the EAN-13 space above is too
 * small for per-unit codes. Uniqueness comes from the per-variant sequence
 * number; the DB unique indexes on unit_code/barcode are the backstop.
 */
export function generateUnitCode(variantId: number, seq: number): string {
  return `PSU-${variantId}-${String(seq).padStart(6, "0")}`;
}

/**
 * Validate EAN-13 barcode format and checksum
 */
export function validateEAN13Barcode(barcode: string): boolean {
  // Remove any spaces or dashes
  const clean = barcode.replace(/[\s-]/g, "");

  // Must be exactly 13 digits
  if (!/^\d{13}$/.test(clean)) {
    return false;
  }

  // Validate checksum
  const providedChecksum = parseInt(clean[12]);
  const calculatedChecksum = calculateEAN13Checksum(clean.substring(0, 12));

  return providedChecksum === calculatedChecksum;
}
