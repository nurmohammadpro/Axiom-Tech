import Link from "next/link";
import type { Product } from "@/data/products";
import { ProductImage } from "./product-image";

export function ProductCard({ product }: { product: Product }) {
  const off = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;
  return (
    <Link
      href={`/product/${product.id}`}
      className="group flex flex-col border border-border bg-card transition-colors hover:border-foreground/40"
    >
      <div className="relative">
        <ProductImage product={product} className="aspect-square w-full" />
        {off > 0 && (
          <span className="absolute left-2 top-2 border border-sale px-1.5 py-0.5 text-[11px] font-medium text-sale">
            -{off}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-border p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {product.brand}
        </div>
        <div className="text-sm font-medium leading-snug group-hover:underline">{product.name}</div>
        <div className="text-xs text-muted-foreground">{product.short}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-sm font-semibold">৳{product.price}</span>
          {product.originalPrice && (
            <span className="text-xs text-muted-foreground line-through">
              ৳{product.originalPrice}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
