"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { Card } from "@/components/dashboard/dashboard-shell";
import { useOrder } from "@/lib/hooks";
import { Check, Circle } from "lucide-react";

const steps: { label: string; status: string }[] = [
  { label: "Placed", status: "Processing" },
  { label: "Confirmed", status: "Processing" },
  { label: "Shipped", status: "Shipped" },
  { label: "Delivered", status: "Delivered" },
];

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: order } = useOrder(id);

  if (!order) {
    return (
      <PortalShell title="Order Not Found">
        <div className="border border-border p-8 text-center text-sm text-muted-foreground">
          Order not found.
          <br />
          <Link
            href="/clientportal/orders"
            className="mt-2 inline-block text-primary hover:underline"
          >
            Back to orders
          </Link>
        </div>
      </PortalShell>
    );
  }

  const statusIndex = steps.findIndex((s) => s.status === order.status);
  const isCancelled = order.status === "Cancelled" || order.status === "Refunded";

  return (
    <PortalShell title={`Order ${order.id}`}>
      <Link
        href="/clientportal/orders"
        className="mb-4 inline-block text-xs text-primary hover:underline"
      >
        &larr; Back to orders
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {new Date(order.createdAt).toLocaleDateString("en-US", {
            weekday: "short",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      </div>

      {/* Timeline */}
      <Card className="mb-4 p-4">
        <div className="flex items-center gap-0">
          {steps.map((s, i) => {
            const done = !isCancelled && statusIndex >= i;
            const current = !isCancelled && statusIndex === i;
            return (
              <div key={s.label} className="flex flex-1 items-center">
                <div className="flex items-center gap-2">
                  <div
                    className={
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium " +
                      (done
                        ? "bg-primary text-primary-foreground"
                        : current
                          ? "border-2 border-primary text-primary"
                          : "border border-border text-muted-foreground")
                    }
                  >
                    {done ? <Check size={13} /> : <Circle size={13} />}
                  </div>
                  <span
                    className={
                      "text-xs " +
                      (done || current ? "text-foreground font-medium" : "text-muted-foreground")
                    }
                  >
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={
                      "mx-2 h-px flex-1 " + (done && i < statusIndex ? "bg-primary" : "bg-border")
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
        {isCancelled && (
          <div className="mt-3 text-xs font-medium text-sale">
            This order was {order.status.toLowerCase()}.
          </div>
        )}
      </Card>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {/* Items */}
        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Items
          </div>
          <div className="space-y-2">
            {(order.items ?? []).map((item) => (
              <div key={item.productId} className="flex items-center justify-between text-sm">
                <span>
                  {item.name} <span className="text-muted-foreground">&times;{item.qty}</span>
                </span>
                <span className="font-mono text-xs">
                  ৳{(item.price * item.qty).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Shipping Address */}
        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Shipping Address
          </div>
          <div className="text-sm leading-relaxed">
            {order.shippingAddress ? (
              <>
                <div className="font-medium">{order.shippingAddress.fullName}</div>
                <div className="text-muted-foreground">{order.shippingAddress.street}</div>
                <div className="text-muted-foreground">
                  {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                  {order.shippingAddress.zip}
                </div>
                <div className="text-muted-foreground">{order.shippingAddress.phone}</div>
              </>
            ) : (
              <div className="text-muted-foreground">No shipping address on file.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Payment Summary */}
        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Payment
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono text-xs">৳{order.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className="font-mono text-xs">
                {order.shipping === 0 ? "Free" : `৳${order.shipping.toLocaleString()}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-mono text-xs">৳{order.tax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-medium">
              <span>Total</span>
              <span className="font-mono text-xs">৳{order.total.toLocaleString()}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{order.paymentMethod}</div>
          </div>
        </Card>

        {/* Tracking */}
        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Tracking
          </div>
          {order.tracking ? (
            <div className="text-sm">
              <div className="text-muted-foreground">{order.tracking.carrier}</div>
              <div className="font-mono text-xs">{order.tracking.trackingNo}</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Not yet available.</div>
          )}
        </Card>
      </div>
    </PortalShell>
  );
}
