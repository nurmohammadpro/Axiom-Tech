"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getSettings, getDashboardStats } from "@/lib/api";
import { useProducts } from "@/lib/hooks";
import { Check, X } from "lucide-react";

const DISMISS_KEY = "axiom-onboarding-dismissed";

/**
 * First-run checklist on the Overview: shop info, products, first sale.
 * Hides itself when everything is done or once dismissed.
 */
export function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const { data: settings } = useQuery({ queryKey: ["dashboard", "settings"], queryFn: getSettings });
  const { data: products = [] } = useProducts({ limit: "1" });
  const { data: stats } = useQuery({
    queryKey: ["dashboard", "stats", "today"],
    queryFn: () => getDashboardStats("today"),
  });

  const storeInfo = ((settings?.store_info ?? {}) as Record<string, any>);
  const infoDone = Boolean(storeInfo.name && storeInfo.name !== "Your Shop" && storeInfo.address);
  const productsDone = products.length > 0;
  // Any sale ever: today's count, or lifetime POS/online orders in the range stats.
  const saleDone =
    (stats?.dailySalesCount ?? 0) > 0 ||
    (stats?.posOrders ?? 0) > 0 ||
    (stats?.onlineOrders ?? 0) > 0;

  if (dismissed || (infoDone && productsDone && saleDone)) return null;

  const steps = [
    {
      done: infoDone,
      label: "Set your shop name, address and receipt header",
      href: "/dashboard/settings",
    },
    {
      done: productsDone,
      label: "Add your first products",
      href: "/dashboard/catalog",
    },
    {
      done: saleDone,
      label: "Complete your first sale in the POS",
      href: "/dashboard/pos",
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Set up your shop</div>
          <div className="text-xs text-muted-foreground">
            {steps.filter((s) => s.done).length}/{steps.length} done — your shop is ready when these are.
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          aria-label="Dismiss setup checklist"
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={15} />
        </button>
      </div>
      <ul className="mt-3 space-y-1.5">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className="flex items-center gap-2 text-sm hover:text-foreground"
              style={{ color: s.done ? "var(--muted-foreground)" : undefined }}
            >
              <span
                className={
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border " +
                  (s.done ? "border-primary bg-primary text-primary-foreground" : "border-border")
                }
              >
                {s.done && <Check size={10} />}
              </span>
              <span className={s.done ? "line-through" : ""}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
