import type { StoreInfo } from "./store-settings";

export interface PriceLine {
  unitPrice: number;
  quantity: number;
  discountAmount?: number;
}

export interface SaleTotals {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
}

// Money is in full BDT (not poisha/cents). VAT-inclusive: total = discounted, tax is a
// slice out of the price: tax = discounted * rate / (1 + rate).
export function computeSaleTotals(lines: PriceLine[], store: StoreInfo): SaleTotals {
  let subtotal = 0;
  let discountAmount = 0;
  for (const l of lines) {
    subtotal += l.unitPrice * l.quantity;
    discountAmount += l.discountAmount ?? 0;
  }
  const discounted = subtotal - discountAmount;
  // No tax calculation
  const taxAmount = 0;
  return {
    subtotal,
    discountAmount,
    taxableAmount: discounted,
    taxAmount,
    totalAmount: discounted,
  };
}
