"use client";

import { useState, useEffect } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { Card, Pill, Table } from "@/components/dashboard/dashboard-shell";
import { useCustomerReturns, useOrders } from "@/lib/hooks";
import { Package, RotateCcw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const statusTone = (status: string) => {
  if (status === "approved" || status === "processing") return "info" as const;
  if (status === "completed" || status === "refunded") return "success" as const;
  if (status === "rejected") return "danger" as const;
  return "muted" as const;
};

export default function Returns() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    setUserId(localStorage.getItem("userId"));
  }, []);
  const { data: returns = [], isLoading } = useCustomerReturns(userId ?? undefined);
  const { data: orders = [] } = useOrders(userId ?? undefined);

  const [showForm, setShowForm] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const handleInitiateReturn = (order: any, item: any) => {
    setSelectedOrderId(order.id);
    setSelectedItem(item);
    setShowForm(true);
  };

  // Filter orders that can be returned (delivered and within return window)
  const returnableOrders = orders.filter((o) => o.status === "Delivered");

  return (
    <PortalShell title="Returns & Exchanges">
      {showForm ? (
        <ReturnForm
          orderId={selectedOrderId!}
          item={selectedItem}
          onCancel={() => {
            setShowForm(false);
            setSelectedOrderId(null);
            setSelectedItem(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setSelectedOrderId(null);
            setSelectedItem(null);
            toast.success("Return request submitted successfully");
          }}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Active Returns
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {returns.filter((r) => r.status === "pending" || r.status === "approved").length}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Completed
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {returns.filter((r) => r.status === "completed" || r.status === "refunded").length}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Total Refunded
              </div>
              <div className="mt-2 text-2xl font-semibold">
                ৳
                {returns
                  .filter((r) => r.refundAmount)
                  .reduce((s, r) => s + (r.refundAmount || 0), 0)
                  .toLocaleString()}
              </div>
            </Card>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading returns…</div>
          ) : returns.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No return requests yet.
            </div>
          ) : (
            <Card className="mb-6">
              <div className="border-b border-border px-4 py-3">
                <div className="text-sm font-medium">Your Return Requests</div>
              </div>
              <div className="divide-y divide-border">
                {returns.map((r) => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded border border-border bg-surface">
                          <Package size={16} className="text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium">{r.productName || r.productId}</div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">#{r.id.slice(0, 12)}</span>
                            <span>·</span>
                            <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                            <span>·</span>
                            <span>Qty: {r.qty}</span>
                          </div>
                          {r.reason && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Reason: {r.reason}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Pill tone={statusTone(r.status)}>{r.status.replace(/_/g, " ")}</Pill>
                        {r.refundAmount && (
                          <div className="text-sm font-medium">
                            ৳{r.refundAmount.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Returnable Orders */}
          <Card>
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <RotateCcw size={16} className="text-muted-foreground" />
                <div className="text-sm font-medium">Start a New Return</div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Select items from your delivered orders to initiate a return
              </div>
            </div>
            {returnableOrders.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                <AlertCircle size={24} className="mx-auto mb-2 opacity-50" />
                No delivered orders available for return.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {returnableOrders.map((order) => (
                  <div key={order.id} className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-medium text-sm">Order {order.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(order.items || []).map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2 text-sm"
                        >
                          <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              Qty: {item.qty} · ৳{item.price.toLocaleString()} each
                            </div>
                          </div>
                          <button
                            onClick={() => handleInitiateReturn(order, item)}
                            className="rounded border border-border px-3 py-1.5 text-xs text-primary hover:border-primary hover:bg-primary/5"
                          >
                            Return
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </PortalShell>
  );
}

function ReturnForm({
  orderId,
  item,
  onCancel,
  onSuccess,
}: {
  orderId: string;
  item: any;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState("new");
  const [resolutionType, setResolutionType] = useState("refund");
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const userId = localStorage.getItem("userId");
      const returnId = `RET-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const response = await fetch("/api/portal/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: returnId,
          orderId,
          productId: item.productId,
          productName: item.name,
          qty,
          reason,
          condition,
          resolutionType,
          userId,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit return");

      onSuccess();
    } catch (error) {
      toast.error("Failed to submit return request");
      setSubmitting(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-medium">Initiate Return</div>
        <div className="text-xs text-muted-foreground">
          Order {orderId} · {item.name}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="p-4">
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Quantity</label>
            <input
              type="number"
              min="1"
              max={item.qty}
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              required
            />
            <div className="mt-1 text-xs text-muted-foreground">Max: {item.qty} items</div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Item Condition</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="new">New in box</option>
              <option value="opened">Opened - unused</option>
              <option value="used">Used</option>
              <option value="damaged">Damaged</option>
              <option value="defective">Defective</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium">Reason for Return</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            required
          >
            <option value="">Select a reason</option>
            <option value="wrong_item">Wrong item received</option>
            <option value="defective">Defective product</option>
            <option value="damaged">Damaged in transit</option>
            <option value="no_longer_needed">No longer needed</option>
            <option value="not_as_described">Not as described</option>
            <option value="ordered_by_mistake">Ordered by mistake</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium">Preferred Resolution</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="resolution"
                value="refund"
                checked={resolutionType === "refund"}
                onChange={() => setResolutionType("refund")}
              />
              Refund
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="resolution"
                value="exchange"
                checked={resolutionType === "exchange"}
                onChange={() => setResolutionType("exchange")}
              />
              Exchange
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="resolution"
                value="repair"
                checked={resolutionType === "repair"}
                onChange={() => setResolutionType("repair")}
              />
              Repair
            </label>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium">Additional Details</label>
          <textarea
            rows={3}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            placeholder="Please provide more details about your return..."
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !reason}
            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Return Request"}
          </button>
        </div>
      </form>
    </Card>
  );
}
