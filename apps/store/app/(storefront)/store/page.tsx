"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProducts, useBrands } from "@/lib/hooks";
import type { Category } from "@/data/products";

function StoreContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeBrand = (searchParams.get("brand") as Category | undefined) ?? undefined;
  const sortParam =
    (searchParams.get("sort") as "featured" | "price-asc" | "price-desc" | undefined) ?? undefined;
  const [maxPrice, setMaxPrice] = useState<number | "">("");

  const { data: brands = [] } = useBrands();
  const allProducts = useProducts(activeBrand ? { brand: activeBrand } : undefined);
  const products = allProducts.data ?? [];

  const filtered = useMemo(() => {
    let arr = products.slice();
    if (typeof maxPrice === "number") arr = arr.filter((p) => p.price <= maxPrice);
    if (sortParam === "price-asc") arr.sort((a, b) => a.price - b.price);
    if (sortParam === "price-desc") arr.sort((a, b) => b.price - a.price);
    return arr;
  }, [products, maxPrice, sortParam]);

  const updateSort = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "featured") {
      params.delete("sort");
    } else {
      params.set("sort", value);
    }
    router.push(`/store?${params.toString()}`);
  };

  const buildBrandHref = (brand?: string) => {
    const params = new URLSearchParams();
    if (brand) params.set("brand", brand);
    if (sortParam) params.set("sort", sortParam);
    const qs = params.toString();
    return qs ? `/store?${qs}` : "/store";
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-end justify-between border-b border-border pb-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Store</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {activeBrand ?? "All products"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">{filtered.length} products</p>
        </div>
        <Select value={sortParam ?? "featured"} onValueChange={updateSort}>
          <SelectTrigger className="w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="featured">Featured</SelectItem>
            <SelectItem value="price-asc">Price · low to high</SelectItem>
            <SelectItem value="price-desc">Price · high to low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <aside className="space-y-6 text-sm">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Brand
            </div>
            <ul className="space-y-1">
              <li>
                <Link
                  href={buildBrandHref()}
                  className={`block border-l border-transparent pl-2 py-0.5 hover:border-foreground ${!activeBrand ? "border-foreground font-medium" : ""}`}
                >
                  All
                </Link>
              </li>
              {brands.map((b) => (
                <li key={b}>
                  <Link
                    href={buildBrandHref(b)}
                    className={`block border-l pl-2 py-0.5 hover:border-foreground ${activeBrand === b ? "border-foreground font-medium" : "border-transparent"}`}
                  >
                    {b}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Max price
            </div>
            <input
              type="number"
              placeholder="Any"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : "")}
              className="w-full border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
        </aside>

        <div>
          {filtered.length === 0 ? (
            <div className="border border-border p-8 text-center text-sm text-muted-foreground">
              No products match. Try clearing filters.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Store() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="h-96 animate-pulse bg-surface" />
        </div>
      }
    >
      <StoreContent />
    </Suspense>
  );
}
