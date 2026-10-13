import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import type { AccountMethodId } from "./payment-methods";

export interface PaymentAccount {
  id: string;
  name: string; // label (bKash/Nagad) / terminal name (card) / account name (bank)
  number: string; // phone (bKash/Nagad) / terminal id (card) / account number (bank)
  bank: string; // bank name — card + bank only, else ""
  isDefault: boolean;
}

export type PaymentAccountsByMethod = Record<AccountMethodId, PaymentAccount[]>;

export interface StoreInfo {
  // General
  name: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  logo: string;
  currency: string;
  // Taxes
  taxRate: number;
  vatInclusive: boolean;
  taxRegNumber: string;
  // Payments
  acceptCash: boolean;
  acceptCard: boolean;
  acceptMobile: boolean;
  bkashNumber: string;
  nagadNumber: string;
  paymentAccounts: PaymentAccountsByMethod;
  // Receipts
  receiptHeader: string;
  receiptFooter: string;
  showLogo: boolean;
  showTaxBreakdown: boolean;
  receiptCopies: number;
  receiptPolicies: string;
  // Loyalty
  loyaltyEnabled: boolean;
  pointsPer100BDT: number;
  redemptionRate: number;
  minRedemption: number;
  welcomeBonus: number;
  // Shipping
  freeShippingThreshold: number;
}

export const DEFAULTS: StoreInfo = {
  name: "Your Shop",
  tagline: "",
  email: "",
  phone: "",
  address: "",
  website: "",
  logo: "",
  currency: "BDT",
  taxRate: 0.15,
  vatInclusive: true,
  taxRegNumber: "",
  acceptCash: true,
  acceptCard: false,
  acceptMobile: false,
  bkashNumber: "",
  nagadNumber: "",
  paymentAccounts: { bkash: [], nagad: [], card: [], bank: [] },
  receiptHeader: "Thank you for shopping!",
  receiptFooter: "Returns accepted within 7 days",
  showLogo: true,
  showTaxBreakdown: false,
  receiptCopies: 1,
  receiptPolicies: [
    "PLEASE KEEP THE FULL BOX FOR WARRANTY PURPOSE.",
    "Goods once sold will not be refunded & changed.",
    "The products under warranty will be repaired or replaced by the manufacturer company.",
    "Timing for the warranty process will be controlled by the manufacturer company.",
    "Manufacturer does not give warranty to Remote Control, Software, Data, Password/BIOS password, Cartridge, Toner, Head, Roller, Drum, Element Cover, Maintenance kit, Cable supplied with product, Gift/Free items, GPU used in data mining, if Sticker-removed, Serial tempered, Compatible Toner/Ink used, Fungus and damp, Up-to 3 display dots, Liquid spillage, Burnt and Physically-damaged etc.",
    "Customers must record an unboxing video outside the store to report any damage issues with the product.",
  ].join("\n"),
  loyaltyEnabled: false,
  pointsPer100BDT: 1,
  redemptionRate: 0.1,
  minRedemption: 100,
  welcomeBonus: 50,
  freeShippingThreshold: 5000,
};

export const getStoreInfo = cache(async (): Promise<StoreInfo> => {
  const [row] = await db.select().from(storeSettings).where(eq(storeSettings.key, "store_info"));
  return row ? { ...DEFAULTS, ...(row.value as Partial<StoreInfo>) } : DEFAULTS;
});
