"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { Table, Pill } from "@/components/dashboard/dashboard-shell";
import { useOrders } from "@/lib/hooks";

const statuses = ["All", "Processing", "Shipped", "Delivered", "Cancelled", "Refunded"];

export default function OrderHistory() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    setUserId(localStorage.getItem("userId"));
  }, []);
  const { data: orders = [] } = useOrders(userId ?? undefined);
  const [filter, setFilter] = useState("All");
  const filtered = filter === "All" ? orders : orders.filter((o) => o.status === filter);

  const rows = filtered.map((o) => [
    <Link
      key={o.id}
      href={`/clientportal/orders/${o.id}`}
      className="font-mono text-xs text-primary hover:underline"
    >
      {o.id}
    </Link>,
    new Date(o.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    <Pill key="s" tone={statusTone(o.status)}>
      {o.status}
    </Pill>,
    o.items?.reduce((s: number, i: any) => s + i.qty, 0) ?? 0,
    `৳${o.total.toLocaleString()}`,
    o.tracking ? o.tracking.carrier : <span className="text-muted-foreground">&mdash;</span>,
    <Link
      key="v"
      href={`/clientportal/orders/${o.id}`}
      className="text-xs text-primary hover:underline"
    >
      View
    </Link>,
  ]);

  return (
    <PortalShell title="Order History">
      <div className="mb-4 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={
              "border px-3 py-1.5 text-xs transition-colors " +
              (filter === s
                ? "border-foreground bg-surface text-foreground"
                : "border-border text-muted-foreground hover:border-foreground")
            }
          >
            {s}
          </button>
        ))}
      </div>

      {rows.length > 0 ? (
        <Table columns={["Order", "Date", "Status", "Items", "Total", "Carrier", ""]} rows={rows} />
      ) : (
        <div className="border border-border p-8 text-center text-sm text-muted-foreground">
          No {filter !== "All" ? filter.toLowerCase() + " " : ""}orders found.
        </div>
      )}
    </PortalShell>
  );
}

function statusTone(s: string): "success" | "warn" | "danger" | "muted" | "info" {
  switch (s) {
    case "Delivered":
      return "success";
    case "Shipped":
      return "info";
    case "Processing":
      return "warn";
    case "Refunded":
      return "danger";
    default:
      return "muted";
  }
}
