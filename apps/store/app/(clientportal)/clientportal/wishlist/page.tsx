"use client";

import { useState, useEffect } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { Card } from "@/components/dashboard/dashboard-shell";
import { useProducts } from "@/lib/hooks";
import { Heart, X } from "lucide-react";

export default function Wishlist() {
  const { data: allProducts = [] } = useProducts();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    if (allProducts.length) setItems(allProducts);
  }, [allProducts]);

  const remove = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id));

  return (
    <PortalShell title="Wishlist">
      <div className="mb-4 text-xs text-muted-foreground">
        {items.length} saved {items.length === 1 ? "item" : "items"}
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Heart size={32} className="mx-auto mb-2 text-border" />
          Your wishlist is empty.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="mb-2 flex items-start justify-between">
                <div
                  className="grid h-14 w-14 place-items-center rounded-sm text-xs font-semibold"
                  style={{ backgroundColor: p.bg, color: p.color }}
                >
                  {p.brand}
                </div>
                <button
                  onClick={() => remove(p.id)}
                  className="text-muted-foreground hover:text-sale"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mb-1 text-sm font-medium leading-snug">{p.name}</div>
              <div className="mb-3 text-xs text-muted-foreground">{p.short}</div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  ৳{p.price.toLocaleString()}
                  {p.originalPrice && (
                    <span className="ml-1 text-xs text-muted-foreground line-through">
                      ৳{p.originalPrice}
                    </span>
                  )}
                </span>
                {!p.inStock && <span className="text-xs text-sale">Out of stock</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
