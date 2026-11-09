"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const FEATURES: Record<string, { name: string; description: string }> = {
  audit: { name: "Audit Log", description: "A full trail of who changed what — prices, stock edits, refunds and staff actions." },
  campaigns: { name: "Campaigns", description: "Create and track marketing campaigns and discounts for your products." },
  cash: { name: "Cash Management", description: "Open and close cash drawers, count drawers and track every taka movement." },
  exchanges: { name: "Exchanges", description: "Take trade-ins: value an old device and settle the difference in one flow." },
  expenses: { name: "Expenses", description: "Track shop expenses by category, daily spend, budgets and petty cash." },
  hr: { name: "HR & Payroll", description: "Leave requests, payroll runs and leave-type setup for your staff." },
  purchases: { name: "Purchases", description: "Purchase orders, stock receiving and supplier dues in one place." },
  suppliers: { name: "Suppliers", description: "Supplier profiles, payment history and dues tracking." },
  returns: { name: "Returns", description: "In-store and customer returns with refunds and restocking." },
  transfers: { name: "Stock Transfers", description: "Move stock between your warehouses with a full transfer trail." },
  analytics: { name: "Analytics", description: "Channel, brand and cohort analysis across your sales." },
};

function UpgradeInner() {
  const params = useSearchParams();
  const feature = params.get("feature") ?? "";
  const f = FEATURES[feature] ?? null;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-10 text-center">
      <Link href="/dashboard" className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft size={12} /> Back to overview
      </Link>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/axiom-mark.svg" alt="" className="h-10 w-10" />
      <h1 className="text-xl font-semibold tracking-tight">
        {f ? `${f.name} is on a higher plan` : "This feature is on a higher plan"}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {f
          ? f.description
          : "The page you tried to open belongs to a plan feature your shop has not enabled."}
      </p>
      <div className="w-full border border-border bg-background p-4 text-left text-sm">
        <div className="font-semibold">How to upgrade</div>
        <p className="mt-1 text-muted-foreground">
          Plan changes are handled by the Axiom Tech team — there is nothing to pay online.
          Call or message us with your shop name and we will switch your plan the same day.
        </p>
        <p className="mt-2 font-semibold">Axiom Tech Support</p>
        <p className="text-xs text-muted-foreground">
          Phone/WhatsApp and email are printed on your shop&apos;s invoice, or ask the agent who set up your shop.
        </p>
      </div>
      <Link href="/dashboard/guide" className="text-xs text-muted-foreground underline hover:text-foreground">
        Open the guide
      </Link>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense>
      <UpgradeInner />
    </Suspense>
  );
}
