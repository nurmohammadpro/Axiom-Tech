import { headers } from "next/headers";
import { tenancyMode } from "./config";
import { gateClient, type ShopResolution } from "./gate-client";

/** What the shop's plan allows. `features: null` means everything (single-shop mode). */
export interface Entitlements {
  features: ReadonlySet<string> | null;
  maxStaff: number | null;
  maxWarehouses: number | null;
}

export const UNLIMITED: Entitlements = { features: null, maxStaff: null, maxWarehouses: null };

export function fromShop(shop: ShopResolution): Entitlements {
  if (shop.kind !== "ok") throw new Error("Shop is not available");
  return { features: new Set(shop.features), maxStaff: shop.maxStaff, maxWarehouses: shop.maxWarehouses };
}

/** Entitlements for the current request's shop (cached gate answer). Call only inside a request. */
export async function currentEntitlements(): Promise<Entitlements> {
  if (tenancyMode() === "single") return UNLIMITED;
  const host = (await headers()).get("host");
  if (!host) throw new Error("Shop is not available");
  return fromShop(await gateClient().resolve(host));
}

export function planAllows(e: Entitlements, feature: string): boolean {
  return e.features === null || e.features.has(feature);
}

/** True when adding one more would exceed the limit. `null` limit = unlimited. */
export function atLimit(current: number, max: number | null): boolean {
  return max !== null && current >= max;
}

/**
 * Which plan feature guards a URL. Only areas that belong to a higher plan are listed; core flows
 * (POS, inventory, products, customers, barcodes, orders, settings, stock receiving) are never gated here.
 */
const SEGMENT_FEATURE: Record<string, string> = {
  "audit-log": "audit",
  "audit-stats": "audit",
  audit: "audit",
  campaigns: "campaigns",
  "cash-stats": "cash",
  cash: "cash",
  exchanges: "exchanges",
  "exchange-customers": "exchanges",
  "exchange-history": "exchanges",
  "exchange-policies": "exchanges",
  expenses: "expenses",
  hr: "hr",
  procurement: "purchases",
  purchases: "purchases",
  returns: "returns",
  suppliers: "suppliers",
  "supplier-types": "suppliers",
  analytics: "analytics",
};

export function featureForPath(pathname: string): string | null {
  const m = /^\/(?:api\/dashboard|dashboard)\/([^/]+)/.exec(pathname);
  if (m) return SEGMENT_FEATURE[m[1]] ?? null;
  if (pathname.startsWith("/api/inventory/transfers")) return "transfers";
  return null;
}
