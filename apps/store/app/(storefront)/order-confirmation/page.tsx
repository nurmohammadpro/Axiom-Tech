"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Suspense } from "react";

function OrderConfirmContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "CH-000000";
  const total = searchParams.get("total") ?? "0.00";

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="border border-border">
        <div className="flex flex-col items-center gap-3 border-b border-border p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary text-primary">
            <Check size={20} />
          </div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Order confirmed
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Thank you for your order</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            We've emailed a receipt and will notify you when your order ships. Same-day dispatch on
            orders placed before 4pm.
          </p>
        </div>
        <dl className="divide-y divide-border text-sm">
          <div className="grid grid-cols-2 px-6 py-3">
            <dt className="text-muted-foreground">Order number</dt>
            <dd className="font-medium">{id}</dd>
          </div>
          <div className="grid grid-cols-2 px-6 py-3">
            <dt className="text-muted-foreground">Total charged</dt>
            <dd className="font-medium">৳{total}</dd>
          </div>
          <div className="grid grid-cols-2 px-6 py-3">
            <dt className="text-muted-foreground">Estimated delivery</dt>
            <dd className="font-medium">2–4 business days</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 border-t border-border p-6 sm:flex-row">
          <Button asChild className="flex-1 justify-center">
            <Link href="/store">Continue shopping</Link>
          </Button>
          <Button asChild variant="surface" className="flex-1 justify-center">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function OrderConfirmation() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="h-96 animate-pulse bg-surface" />
        </div>
      }
    >
      <OrderConfirmContent />
    </Suspense>
  );
}
