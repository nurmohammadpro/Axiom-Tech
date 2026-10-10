/**
 * Unit-tracking semantics, shared by POS, sales, receiving, transfers, and the
 * labels page. Devices (productType "new") are always unit-tracked; accessories
 * opt in via products.track_units so each box gets its own scannable identity.
 * Plain accessories stay quantity-only.
 */
export function isUnitTracked(p: { productType: string; trackUnits?: boolean | null }): boolean {
  return p.productType !== "accessory" || Boolean(p.trackUnits);
}
