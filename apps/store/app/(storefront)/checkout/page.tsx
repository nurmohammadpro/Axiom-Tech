"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { useCart } from "@/lib/cart";
import { useProducts } from "@/lib/hooks";
import { toast } from "sonner";

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        name={name}
        {...props}
        className="w-full border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
      />
    </label>
  );
}

export default function Checkout() {
  const { items, clear } = useCart();
  const router = useRouter();
  const [pay, setPay] = useState<"card" | "cod">("card");

  const { data: allProducts = [] } = useProducts();
  const productMap = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts]);
  const rows = items
    .map((i) => ({ item: i, product: productMap.get(i.id)! }))
    .filter((r) => r.product);
  const subtotal = rows.reduce((s, r) => s + r.product.price * r.item.qty, 0);
  const shipping = subtotal > 50 || subtotal === 0 ? 0 : 9;
  const total = subtotal + shipping;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rows.length === 0) return;

    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const shippingAddress = {
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      address: formData.get("address") as string,
      city: formData.get("city") as string,
      postalCode: formData.get("postalCode") as string,
      country: formData.get("country") as string,
      state: formData.get("state") as string,
    };

    const customerEmail = formData.get("email") as string;
    const customerPhone = formData.get("phone") as string;

    const items = rows.map(({ item, product }) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: item.qty,
    }));

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail,
          customerPhone,
          items,
          shippingAddress,
          paymentMethod: pay,
          notes: "",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create order");
      }

      const data = await response.json();
      clear();
      router.push(`/order-confirmation?id=${data.orderId}&total=${total.toFixed(2)}`);
    } catch (error) {
      console.error("Order creation failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create order");
    }
  };

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-lg font-semibold">Your cart is empty</h1>
        <Button asChild variant="surface">
          <Link href="/store">Shop now</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="border-b border-border pb-3 text-2xl font-semibold tracking-tight">
        Checkout
      </h1>
      <form onSubmit={onSubmit} className="mt-6 grid gap-8 md:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">Contact</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                name="email"
                label="Email"
                type="email"
                required
                placeholder="you@example.com"
              />
              <Field name="phone" label="Phone" type="tel" required placeholder="+1 555 000 0000" />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">
              Shipping address
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Field name="firstName" label="First name" required />
              <Field name="lastName" label="Last name" required />
              <div className="md:col-span-2">
                <Field name="address" label="Address" required />
              </div>
              <Field name="city" label="City" required />
              <Field name="postalCode" label="Postal code" required />
              <Field name="country" label="Country" required defaultValue="United States" />
              <Field name="state" label="State / Region" required />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">Payment</h2>
            <div className="grid gap-2">
              <label
                className={`flex items-center gap-2 border p-3 text-sm ${pay === "card" ? "border-foreground" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="pay"
                  checked={pay === "card"}
                  onChange={() => setPay("card")}
                />
                Credit / debit card
              </label>
              <label
                className={`flex items-center gap-2 border p-3 text-sm ${pay === "cod" ? "border-foreground" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="pay"
                  checked={pay === "cod"}
                  onChange={() => setPay("cod")}
                />
                Cash on delivery
              </label>
            </div>
            {pay === "card" && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field
                    name="cardNumber"
                    label="Card number"
                    required
                    placeholder="1234 5678 9012 3456"
                    inputMode="numeric"
                  />
                </div>
                <Field name="expiry" label="Expiry (MM/YY)" required placeholder="12/28" />
                <Field name="cvc" label="CVC" required placeholder="123" inputMode="numeric" />
                <div className="md:col-span-2">
                  <Field name="cardName" label="Name on card" required />
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="h-fit border border-border">
          <div className="border-b border-border bg-surface px-4 py-2 text-xs font-medium uppercase tracking-wider">
            Order summary
          </div>
          <ul className="divide-y divide-border">
            {rows.map(({ item, product }) => (
              <li key={item.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium leading-tight">{product.name}</div>
                  <div className="text-xs text-muted-foreground">Qty {item.qty}</div>
                </div>
                <div className="font-medium">৳{(product.price * item.qty).toLocaleString()}</div>
              </li>
            ))}
          </ul>
          <div className="space-y-1.5 border-t border-border p-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>৳{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span>{shipping === 0 ? "Free" : `৳${shipping.toLocaleString()}`}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Total</span>
              <span>৳{total.toLocaleString()}</span>
            </div>
            <Button type="submit" className="mt-3 w-full justify-center">
              Place order
            </Button>
            <p className="text-[11px] text-muted-foreground">
              By placing this order you agree to our terms.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
