"use client";

import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";

const LABELS: Record<string, string> = {
  audit: "Audit log", campaigns: "Campaigns", cash: "Cash management", exchanges: "Device exchanges",
  expenses: "Expense management", hr: "Staff, HR and payroll", purchases: "Suppliers and purchasing",
  returns: "Returns and refunds", suppliers: "Suppliers", analytics: "Analytics", transfers: "Stock transfers",
};

/** Shown when proxy.ts redirected here with ?upgrade=<feature> because the shop's plan excludes that area. */
export function UpgradeBanner() {
  const [feature, setFeature] = useState<string | null>(null);
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("upgrade");
    if (f) setFeature(f);
  }, []);
  if (!feature) return null;
  const name = LABELS[feature] ?? "This feature";
  return (
    <div role="status" className="rounded-md mb-4 flex items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <Lock size={14} />
      <span className="flex-1">{name} is not included in your current plan. Contact Axiom Tech to upgrade.</span>
      <button type="button" aria-label="Dismiss" onClick={() => setFeature(null)}><X size={14} /></button>
    </div>
  );
}
