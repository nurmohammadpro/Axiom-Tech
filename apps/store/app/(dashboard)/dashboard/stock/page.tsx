"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/dashboard/dashboard-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReceiveModal } from "@/components/inventory/receive-modal";
import { bdt } from "@/lib/utils";
import { Package, Truck } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { SortableTable } from "@/components/dashboard/sortable-table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PurchaseOrder {
  id: string;
  supplier: string;
  supplierId: string | null;
  status: string | null;
  total: number;
  notes: string | null;
  createdAt: string | null;
  receivedAt: string | null;
  itemCount?: number;
}

interface POLineItem {
  id: number;
  productId: string;
  variantId: number | null;
  productName: string;
  variantName: string;
  sku: string;
  qtyOrdered: number;
  qtyReceived: number;
  costPrice: number;
  sellPrice: number;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StockIntakePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [receivePO, setReceivePO] = useState<string | null>(null);
  const [receiveItems, setReceiveItems] = useState<POLineItem[]>([]);

  const { data: orders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["dashboard", "procurement"],
    queryFn: () => fetch("/api/dashboard/procurement").then((r) => r.json()),
  });

  const pendingOrders = orders.filter(
    (o) => o.status === "pending" || o.status === "partial" || o.status === "in_transit",
  );

  const filtered = pendingOrders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        o.supplier.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openPOs = pendingOrders.length;
  const totalCommitted = pendingOrders.reduce((s, o) => s + o.total, 0);

  const openReceive = async (poId: string) => {
    const res = await fetch(`/api/dashboard/procurement/items?poId=${poId}`);
    const items = await res.json().catch(() => []);
    setReceivePO(poId);
    setReceiveItems(items);
  };

  const statusTone = (s: string) => {
    if (s === "received") return "success" as const;
    if (s === "partial") return "warn" as const;
    if (s === "pending" || s === "in_transit") return "info" as const;
    return "muted" as const;
  };

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-muted-foreground">Open POs</div>
          <div className="text-2xl font-bold mt-1">{openPOs}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-muted-foreground">Total Committed</div>
          <div className="text-2xl font-bold mt-1">{bdt(totalCommitted)}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs text-muted-foreground">Total POs</div>
          <div className="text-2xl font-bold mt-1">{orders.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search POs..."
            label="Search Stock Orders"
            description="search by PO number or supplier"
          />
          <div className="flex gap-1">
            {["all", "pending", "in_transit", "partial"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={
                  "border px-2.5 py-1 text-xs transition-colors " +
                  (statusFilter === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {s === "all" ? "All" : s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PO Table */}
      <div className="mt-3">
        <SortableTable
          columns={[
            { key: "id", header: "PO #", sortable: true, className: "font-medium" },
            {
              key: "supplier",
              header: "Supplier",
              sortable: true,
              className: "text-muted-foreground",
            },
            {
              key: "itemCount",
              header: "Items",
              sortable: true,
              className: "text-muted-foreground",
              render: (v: number | undefined) => v ?? 0,
            },
            {
              key: "total",
              header: "Total",
              sortable: true,
              className: "font-medium",
              render: (v: number) => bdt(v),
            },
            {
              key: "createdAt",
              header: "Created",
              sortable: true,
              className: "text-xs text-muted-foreground",
              render: (v: string | null) => (v ? new Date(v).toLocaleDateString("en-BD") : "—"),
            },
            {
              key: "status",
              header: "Status",
              render: (v: string | null) => <Pill tone={statusTone(v || "")}>{v}</Pill>,
            },
            {
              key: "actions",
              header: "Action",
              render: (_v: unknown, o: PurchaseOrder) => (
                <Button size="sm" variant="outline" onClick={() => openReceive(o.id)}>
                  <Truck size={13} className="mr-1" /> Receive
                </Button>
              ),
            },
          ]}
          data={filtered.map((o) => ({ ...o }))}
          rowKey={(o) => o.id}
          pageSize={25}
          emptyMessage={
            search || statusFilter !== "all"
              ? "No POs match your filters."
              : "No pending purchase orders. Create one from Purchases page."
          }
        />
      </div>

      {/* Receive Modal */}
      {receivePO && (
        <ReceiveModal
          poId={receivePO}
          items={receiveItems}
          onClose={() => { setReceivePO(null); setReceiveItems([]); }}
          onReceived={() => {
            setReceivePO(null);
            setReceiveItems([]);
            void qc.invalidateQueries({ queryKey: ["dashboard", "procurement"] });
          }}
        />
      )}
    </>
  );
}
