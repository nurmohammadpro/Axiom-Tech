"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, Pill } from "@/components/dashboard/dashboard-shell";
import { useOrder } from "@/lib/hooks";
import { bdt } from "@/lib/utils";
import { ArrowLeft, Check, RefreshCcw, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const statusOrder = [
  "pending",
  "confirmed",
  "payment confirmed",
  "sent to courier",
  "completed",
  "returned",
];

function statusTone(status: string): "success" | "warn" | "danger" | "info" | "muted" {
  const s = status.toLowerCase();
  if (s === "completed") return "success";
  if (s === "payment confirmed" || s === "confirmed") return "info";
  if (s === "sent to courier") return "warn";
  if (s === "returned") return "danger";
  return "muted";
}

function fmtMoney(total: number | undefined, channel?: string): string {
  return bdt(Number(total ?? 0));
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);
  const [updating, setUpdating] = useState<string | null>(null);

  const statusIdx = statusOrder.indexOf(String(order?.status || "").toLowerCase());
  const nextStatus =
    statusIdx === -1 || statusIdx === statusOrder.length - 1 ? null : statusOrder[statusIdx + 1];

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(newStatus);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update status");
      }
      toast.success(`Status updated to ${newStatus}`);
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setUpdating(null);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <div className="h-24 animate-pulse border border-border bg-background" />
        <div className="h-64 animate-pulse border border-border bg-background" />
      </div>
    );
  }

  if (!order) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Order not found.
        <br />
        <Link href="/dashboard/orders" className="mt-2 inline-block text-primary hover:underline">
          Back to orders
        </Link>
      </Card>
    );
  }

  const isPOS = order.channel === "POS";
  const items = order.items ?? [];
  const customerLine = order.customerName || order.customerEmail || order.customerPhone || "Guest";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/orders"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ArrowLeft size={12} /> Back to orders
        </Link>
        <div className="flex items-center gap-2">
          {nextStatus && (
            <Button
              size="sm"
              onClick={() => void handleStatusChange(nextStatus)}
              disabled={updating !== null}
            >
              {updating === nextStatus ? "Updating…" : `→ ${nextStatus}`}
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              {isPOS ? "POS sale" : "Online order"}
            </div>
            <div className="mt-1 text-lg font-semibold tracking-tight">
              {isPOS ? order.saleNumber || order.id : order.id}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Placed {order.createdAt ? new Date(order.createdAt).toLocaleString() : "—"}
              {isPOS && order.invoiceNumber && <> · Invoice {order.invoiceNumber}</>}
              {order.storeId && <> · {order.storeId}</>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Pill tone={statusTone(order.status)}>{order.status}</Pill>
            <div className="text-2xl font-semibold tracking-tight">
              {fmtMoney(order.total, order.channel)}
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Items
          </div>
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No items.</div>
          ) : (
            <div className="space-y-2">
              {items.map((item: any, i: number) => {
                const lineTotal = Number(item.price ?? 0) * Number(item.qty ?? 0);
                return (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{item.name}</div>
                      {item.sku && (
                        <div className="text-xs text-muted-foreground">
                          {item.sku} · {bdt(Number(item.price ?? 0))} × {item.qty}
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-xs">{fmtMoney(lineTotal, order.channel)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Customer
          </div>
          <div className="space-y-1 text-sm">
            <div className="font-medium">{customerLine}</div>
            {order.customerEmail && (
              <div className="text-muted-foreground">{order.customerEmail}</div>
            )}
            {order.customerPhone && (
              <div className="text-muted-foreground">{order.customerPhone}</div>
            )}
            <div className="pt-1 text-muted-foreground">
              Payment: <span className="font-medium capitalize">{order.paymentMethod}</span>
            </div>
            {order.paymentIntentId && (
              <div className="text-xs text-muted-foreground">Intent: {order.paymentIntentId}</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Totals
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono text-xs">{fmtMoney(order.subtotal, order.channel)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className="font-mono text-xs">
                {order.shipping === 0 ? "Free" : fmtMoney(order.shipping, order.channel)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-mono text-xs">{fmtMoney(order.tax, order.channel)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-medium">
              <span>Total</span>
              <span className="font-mono text-xs">{fmtMoney(order.total, order.channel)}</span>
            </div>
            {order.discountAmount != null && order.discountAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-mono text-xs text-green-600">
                  -{fmtMoney(order.discountAmount, order.channel)}
                </span>
              </div>
            )}
            {order.paidAmount != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-mono text-xs">
                  {fmtMoney(order.paidAmount, order.channel)}
                </span>
              </div>
            )}
            {order.changeAmount != null && order.changeAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Change</span>
                <span className="font-mono text-xs">
                  {fmtMoney(order.changeAmount, order.channel)}
                </span>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Shipping address
          </div>
          {order.shippingAddress ? (
            <div className="space-y-0.5 text-sm">
              {order.shippingAddress.firstName && order.shippingAddress.lastName && (
                <div className="font-medium">
                  {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                </div>
              )}
              {order.shippingAddress.address && (
                <div className="text-muted-foreground">{order.shippingAddress.address}</div>
              )}
              {(order.shippingAddress.city ||
                order.shippingAddress.state ||
                order.shippingAddress.postalCode) && (
                <div className="text-muted-foreground">
                  {[order.shippingAddress.city, order.shippingAddress.state]
                    .filter(Boolean)
                    .join(", ")}{" "}
                  {order.shippingAddress.postalCode}
                </div>
              )}
              {order.shippingAddress.country && (
                <div className="text-muted-foreground">{order.shippingAddress.country}</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {isPOS ? "In-store sale — no shipping." : "No shipping address on file."}
            </div>
          )}
          {order.tracking && (
            <div className="mt-3 border-t border-border pt-2 text-sm">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <Truck size={12} /> Tracking
              </div>
              <div className="mt-1 text-muted-foreground">
                {order.tracking.carrier}:{" "}
                <span className="font-mono">{order.tracking.trackingNo}</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {order.notes && (
        <Card className="mt-4 p-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Notes
          </div>
          <div className="text-sm">{order.notes}</div>
        </Card>
      )}

      {nextStatus && (
        <div className="mt-4 flex items-center justify-between rounded-sm border border-border bg-background p-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Check size={14} className="text-primary" /> Next step
          </div>
          <Button
            size="sm"
            onClick={() => void handleStatusChange(nextStatus)}
            disabled={updating !== null}
          >
            {updating === nextStatus ? (
              "Updating…"
            ) : (
              <>
                <RefreshCcw size={12} /> Move to {nextStatus}
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
}
