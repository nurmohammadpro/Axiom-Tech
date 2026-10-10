import type { Product } from "@/data/products";

export function ProductImage({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  const image = product.images?.[0];
  if (image) {
    return (
      <div className={`overflow-hidden ${className}`} style={{ backgroundColor: product.bg }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={product.name} className="h-full w-full object-cover" />
      </div>
    );
  }

  const initials =
    product.brand === "MacBook"
      ? "MB"
      : product.brand === "Headphones"
        ? "◎"
        : product.brand === "Watch"
          ? "⌚"
          : product.brand === "VR"
            ? "VR"
            : product.brand === "Charger"
              ? "⚡"
              : product.brand.slice(0, 2);
  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{ backgroundColor: product.bg }}
    >
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-medium"
          style={{ color: product.color, border: `1px solid ${product.color}22` }}
        >
          {initials}
        </div>
        <div className="text-xs font-medium tracking-wide" style={{ color: product.color }}>
          {product.name}
        </div>
      </div>
    </div>
  );
}
