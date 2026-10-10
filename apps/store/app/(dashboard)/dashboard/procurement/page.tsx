"use client";

import { Table, Pill, Stat } from "@/components/dashboard/dashboard-shell";
import { usePurchaseOrders } from "@/lib/hooks";
import { bdt } from "@/lib/utils";

const statusTone = (status: string) => {
  if (status === "received") return "success" as const;
  if (status === "overdue") return "danger" as const;
  if (status === "partial") return "warn" as const;
  if (status === "pending" || status === "in_transit") return "info" as const;
  return "muted" as const;
};

export default function Procurement() {
  const { data: orders = [] } = usePurchaseOrders();

  const openPOs = orders.filter((o) => o.status !== "received").length;
  const overdue = orders.filter((o) => o.status === "overdue").length;
  const totalCommitted = orders
    .filter((o) => o.status !== "received")
    .reduce((s, o) => s + o.total, 0);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat
          label="Open POs"
          value={String(openPOs)}
          hint={openPOs > 0 ? `${bdt(totalCommitted)} committed` : undefined}
        />
        <Stat label="Overdue" value={String(overdue)} />
        <Stat label="Received this week" value="—" />
        <Stat label="Avg. lead time" value="—" />
      </div>

      <div className="mt-3">
        {orders.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No purchase orders yet. Create a PO to start receiving stock.
          </div>
        ) : (
          <Table
            columns={["PO #", "Supplier", "Items", "Value", "Expected", "Status", ""]}
            rows={orders.map((o) => [
              o.id,
              o.supplier,
              "—",
              bdt(o.total ?? 0),
              o.receivedAt ? new Date(o.receivedAt).toLocaleDateString() : "—",
              <Pill key="s" tone={statusTone(o.status)}>
                {o.status}
              </Pill>,
              <button key="v" className="text-primary hover:underline">
                View
              </button>,
            ])}
          />
        )}
      </div>
    </>
  );
}
