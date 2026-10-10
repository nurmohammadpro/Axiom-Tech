"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { ArrowRight } from "lucide-react";
import { useProducts, useBrands } from "@/lib/hooks";

export default function Home() {
  const { data: brands = [] } = useBrands();
  const { data: allProducts = [] } = useProducts();
  const featured = allProducts
    .filter((p) => p.originalPrice && p.originalPrice - p.price >= 50)
    .slice(0, 8);
  const phones = allProducts.filter((p) => p.category === "Phones").slice(0, 6);
  const accessories = allProducts.filter((p) => p.category === "Accessories").slice(0, 4);

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-0 px-0 md:grid-cols-2">
          <div className="flex flex-col justify-center gap-4 border-b border-border p-8 md:border-b-0 md:border-r md:p-14">
            <div className="text-xs uppercase tracking-widest text-sale">
              Summer sale · up to 20% off
            </div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              Galaxy S24 Ultra.
              <br />
              Titanium. AI-powered.
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              200MP camera, Snapdragon 8 Gen 3, and Galaxy AI translation on the go. Save ৳8,000
              this week.
            </p>
            <div className="flex gap-3">
              <Button asChild>
                <Link href="/product/galaxy-s24-ultra">Shop now</Link>
              </Button>
              <Button asChild variant="surface">
                <Link href="/store?brand=Samsung">Explore Samsung</Link>
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-center bg-surface p-10 md:p-16">
            <div className="flex aspect-[4/5] w-full max-w-sm flex-col items-center justify-center border border-border bg-background">
              <div className="text-6xl font-light tracking-tighter text-foreground/80">S24</div>
              <div className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
                Ultra · Titanium
              </div>
              <div className="mt-6 text-lg font-semibold">৳75,000</div>
              <div className="text-xs text-muted-foreground line-through">৳83,000</div>
            </div>
          </div>
        </div>
      </section>

      {/* Brand strip */}
      <section className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-4">
          {brands.map((b) => (
            <Link
              key={b}
              href={`/store?brand=${encodeURIComponent(b)}`}
              className="border border-border px-3 py-1.5 text-xs hover:border-foreground"
            >
              {b}
            </Link>
          ))}
        </div>
      </section>

      {/* On sale */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-4 flex items-end justify-between border-b border-border pb-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-sale">On sale</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">This week's deals</h2>
          </div>
          <Link href="/store" className="flex items-center gap-1 text-xs hover:underline">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Category tiles */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 py-10 md:grid-cols-4">
          {[
            { label: "Smartphones", to: "iPhone" as const, note: "iPhone · Galaxy · Pixel" },
            { label: "Laptops", to: "MacBook" as const, note: "MacBook Air & Pro" },
            { label: "Audio", to: "Headphones" as const, note: "AirPods · Galaxy Buds" },
            { label: "Wearables", to: "Watch" as const, note: "Apple Watch · Galaxy Watch" },
          ].map((c) => (
            <Link
              key={c.label}
              href={`/store?brand=${encodeURIComponent(c.to)}`}
              className="flex aspect-[4/3] flex-col justify-between border border-border bg-background p-4 hover:border-foreground"
            >
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {c.note}
              </div>
              <div className="text-lg font-semibold">{c.label} →</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Phones */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-4 flex items-end justify-between border-b border-border pb-3">
          <h2 className="text-xl font-semibold tracking-tight">Popular phones</h2>
          <Link href="/store" className="text-xs hover:underline">
            Browse all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {phones.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Accessories */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-4 flex items-end justify-between border-b border-border pb-3">
          <h2 className="text-xl font-semibold tracking-tight">Accessories & audio</h2>
          <Link href="/store?brand=Headphones" className="text-xs hover:underline">
            Shop audio
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {accessories.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Value strip */}
      <section className="border-t border-border">
        <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-border border-x border-border md:grid-cols-4 md:divide-x md:divide-y-0">
          {[
            ["Same-day dispatch", "Order by 4pm"],
            ["Official warranty", "Manufacturer-backed"],
            ["Free returns", "Within 14 days"],
            ["Instore pickup", "Ready in 1 hour"],
          ].map(([t, s]) => (
            <div key={t} className="p-5">
              <div className="text-sm font-medium">{t}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{s}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
