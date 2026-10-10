"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Minus, Plus, X } from "lucide-react";
import { useMemo } from "react";
import { useCart } from "@/lib/cart";
import { useProducts } from "@/lib/hooks";
import { ProductImage } from "@/components/product-image";

export default function CartPage() {
  const { items, setQty, remove } = useCart();
  const { data: allProducts = [] } = useProducts();
  const productMap = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts]);
  const rows = items
    .map((i) => ({ item: i, product: productMap.get(i.id)! }))
    .filter((r) => r.product);
  const subtotal = rows.reduce((s, r) => s + r.product.price * r.item.qty, 0);
  const shipping = subtotal > 50 || subtotal === 0 ? 0 : 9;
  const total = subtotal + shipping;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="border-b border-border pb-3 text-2xl font-semibold tracking-tight">
        Your cart
      </h1>

      {rows.length === 0 ? (
        <div className="mt-10 border border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Your cart is empty.</p>
          <Button asChild variant="surface">
            <Link href="/store">Continue shopping</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-8 md:grid-cols-[1fr_320px]">
          <div className="border border-border">
            {rows.map(({ item, product }) => (
              <div key={item.id} className="flex gap-4 border-b border-border p-4 last:border-b-0">
                <ProductImage
                  product={product}
                  className="h-24 w-24 shrink-0 border border-border"
                />
                <div className="flex flex-1 flex-col">
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {product.brand}
                      </div>
                      <Link
                        href={`/product/${product.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                    </div>
                    <button
                      onClick={() => remove(item.id)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-auto flex items-end justify-between">
                    <div className="flex items-center border border-border">
                      <button
                        onClick={() => setQty(item.id, item.qty - 1)}
                        className="px-2 py-1 text-muted-foreground hover:text-foreground"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-8 text-center text-xs">{item.qty}</span>
                      <button
                        onClick={() => setQty(item.id, item.qty + 1)}
                        className="px-2 py-1 text-muted-foreground hover:text-foreground"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-sm font-semibold">
                      ৳{(product.price * item.qty).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <aside className="h-fit border border-border">
            <div className="border-b border-border bg-surface px-4 py-2 text-xs font-medium uppercase tracking-wider">
              Order summary
            </div>
            <div className="space-y-2 p-4 text-sm">
              <Row label="Subtotal" value={`৳${subtotal.toLocaleString()}`} />
              <Row label="Shipping" value={shipping === 0 ? "Free" : `৳${shipping.toLocaleString()}`} />
              <div className="border-t border-border pt-2">
                <Row label="Total" value={`৳${total.toLocaleString()}`} bold />
              </div>
              <Button asChild className="w-full justify-center">
                <Link href="/checkout">Checkout</Link>
              </Button>
              <Button asChild variant="surface" className="w-full justify-center">
                <Link href="/store">Continue shopping</Link>
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
