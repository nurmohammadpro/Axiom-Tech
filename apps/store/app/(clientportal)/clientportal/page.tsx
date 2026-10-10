"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { Card, Stat, Table, Pill } from "@/components/dashboard/dashboard-shell";
import { useProfile, useOrders, useAddresses } from "@/lib/hooks";

export default function Overview() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    setUserId(localStorage.getItem("userId"));
  }, []);
  const { data: profile } = useProfile(userId ?? undefined);
  const { data: orders = [] } = useOrders(userId ?? undefined);
  const { data: addresses = [] } = useAddresses(userId ?? undefined);

  const recent = orders.slice(0, 5).map((o) => [
    <span key={o.id} className="font-mono text-xs">
      {o.id}
    </span>,
    new Date(o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    <Pill key="s" tone={statusTone(o.status)}>
      {o.status}
    </Pill>,
    `৳${o.total.toLocaleString()}`,
    <Link
      key="v"
      href={`/clientportal/orders/${o.id}`}
      className="text-xs text-primary hover:underline"
    >
      View
    </Link>,
  ]);

  return (
    <PortalShell title="Overview">
      <Card className="mb-4 p-4">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {profile ? profile.firstName[0] : "?"}
            {profile ? profile.lastName[0] : ""}
          </div>
          <div>
            <div className="text-lg font-semibold">
              {profile ? `${profile.firstName} ${profile.lastName}` : "Loading..."}
            </div>
            <div className="text-xs text-muted-foreground">
              {profile
                ? `Member since ${new Date(profile.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}`
                : ""}
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Total Orders" value={String(orders.length)} />
        <Stat
          label="Loyalty Points"
          value={profile ? (profile.loyaltyPoints ?? 0).toLocaleString() : "0"}
        />
        <Stat label="Saved Addresses" value={String(addresses.length)} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">Recent orders</div>
          <Link href="/clientportal/orders" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        <Table columns={["Order", "Date", "Status", "Total", ""]} rows={recent} />
      </div>
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
