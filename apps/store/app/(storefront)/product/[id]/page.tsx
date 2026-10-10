"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useProduct, useProducts } from "@/lib/hooks";
import { ProductImage } from "@/components/product-image";
import { ProductCard } from "@/components/product-card";
import { useCart } from "@/lib/cart";
import { Minus, Plus, Check } from "lucide-react";

function renderSpecValue(value: string): string {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const lines = withBold.split("\n");
  const bulletLines: string[] = [];
  const result: string[] = [];
  for (const line of lines) {
    if (line.startsWith("- ") || line.startsWith("• ")) {
      bulletLines.push(`<li>${line.replace(/^[-•]\s+/, "")}</li>`);
    } else {
      if (bulletLines.length > 0) {
        result.push(`<ul class="list-disc pl-4">${bulletLines.join("")}</ul>`);
        bulletLines.length = 0;
      }
      result.push(line ? `<span>${line}</span>` : "<br/>");
    }
  }
  if (bulletLines.length > 0) {
    result.push(`<ul class="list-disc pl-4">${bulletLines.join("")}</ul>`);
  }
  return result.join("");
}

interface VariantAttr {
  name: string;
  value: string;
}

interface Variant {
  id: number;
  name: string;
  attribute: VariantAttr[];
  sku: string;
  sellingPrice: number;
  quantity: number;
}

export default function PDP() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: product } = useProduct(id);
  const cart = useCart();
  const [qty, setQty] = useState(1);
  const [variantSelection, setVariantSelection] = useState<Record<string, string>>({});
  const [activeImage, setActiveImage] = useState(0);

  // Reset the gallery when navigating between products.
  useEffect(() => {
    setActiveImage(0);
  }, [product?.id]);

  const parsed = useMemo(() => {
    const variants: Variant[] = (product as any)?.variants || [];
    if (variants.length === 0) return { dimensions: [], activeVariant: null };

    const dimMap = new Map<string, Set<string>>();
    for (const v of variants) {
      for (const attr of v.attribute || []) {
        if (!dimMap.has(attr.name)) dimMap.set(attr.name, new Set());
        dimMap.get(attr.name)!.add(attr.value);
      }
    }
    const dimensions = Array.from(dimMap.entries()).map(([name, values]) => ({
      name,
      values: Array.from(values),
    }));

    const activeVariant =
      variants.find((v) =>
        (v.attribute || []).every((a) => variantSelection[a.name] === a.value),
      ) || null;

    return { dimensions, activeVariant };
  }, [product, variantSelection]);

  const { dimensions: dims, activeVariant } = parsed;

  const selectValue = (dimName: string, value: string) => {
    setVariantSelection((prev) => ({ ...prev, [dimName]: value }));
  };

  // Reset quantity when variant changes to avoid exceeding stock
  useEffect(() => {
    if (activeVariant && qty > activeVariant.quantity) {
      setQty(activeVariant.quantity > 0 ? activeVariant.quantity : 1);
    }
  }, [activeVariant, qty]);

  const displayPrice = activeVariant
    ? activeVariant.sellingPrice.toLocaleString()
    : product?.price.toLocaleString() || "0";
  const displayOriginal = product?.originalPrice?.toLocaleString();

  const { data: relatedProducts = [] } = useProducts(
    product ? { brand: product.brand } : undefined,
  );
  const related = (relatedProducts || []).filter((p) => p.id !== product?.id).slice(0, 4);

  const add = () => {
    if (!product) return;
    cart.add(product.id, qty);
    const label = activeVariant ? ` ${activeVariant.name}` : "";
    toast.success("Added to cart", { description: `${qty}× ${product.name}${label}` });
  };
  const buy = () => {
    if (!product) return;
    cart.add(product.id, qty);
    router.push("/checkout");
  };

  if (!product) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-lg font-semibold">Product not found</h1>
        <Link href="/store" className="mt-4 inline-block text-sm underline">
          Back to store
        </Link>
      </div>
    );
  }

  const images = product.images || [];
  const activeIndex = Math.min(activeImage, Math.max(0, images.length - 1));

  const off = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        /{" "}
        <Link href="/store" className="hover:underline">
          Store
        </Link>{" "}
        /{" "}
        <Link
          href={`/store?brand=${encodeURIComponent(product.brand)}`}
          className="hover:underline"
        >
          {product.brand}
        </Link>{" "}
        / <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="border border-border">
          {images.length > 0 ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[activeIndex]}
                alt={product.name}
                className="aspect-square w-full object-cover"
              />
              {images.length > 1 && (
                <div className="flex gap-2 border-t border-border p-2">
                  {images.map((src, i) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setActiveImage(i)}
                      className={`h-14 w-14 shrink-0 overflow-hidden border ${
                        i === activeIndex ? "border-foreground" : "border-border"
                      }`}
                      aria-label={`View image ${i + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <ProductImage product={product} className="aspect-square w-full" />
          )}
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {product.brand}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{product.short}</p>

          <div className="mt-4 flex items-baseline gap-3 border-y border-border py-4">
            <span className="text-2xl font-semibold">৳{displayPrice}</span>
            {displayOriginal && (
              <>
                <span className="text-sm text-muted-foreground line-through">
                  ৳{displayOriginal}
                </span>
                <span className="border border-sale px-1.5 py-0.5 text-[11px] font-medium text-sale">
                  Save {off}%
                </span>
              </>
            )}
          </div>

          {/* Variant selectors */}
          {dims.length > 0 && (
            <div className="mt-4 space-y-4">
              {dims.map((dim) => (
                <div key={dim.name}>
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {dim.name}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dim.values.map((val) => {
                      const selected = variantSelection[dim.name] === val;
                      return (
                        <button
                          key={val}
                          onClick={() => selectValue(dim.name, val)}
                          className={`border px-3 py-1.5 text-sm transition-colors ${
                            selected
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background text-foreground hover:border-foreground"
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-sm text-muted-foreground">{product.description}</p>

          <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            {activeVariant && activeVariant.quantity > 0 ? (
              <>
                <Check size={14} className="text-primary" /> In stock · {activeVariant.quantity}{" "}
                available
              </>
            ) : activeVariant && activeVariant.quantity === 0 ? (
              <span className="text-destructive">Out of stock</span>
            ) : (
              <>
                <Check size={14} className="text-primary" /> In stock · ships today
              </>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center border border-border">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="px-2 py-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Decrease"
              >
                <Minus size={14} />
              </button>
              <span className="w-8 text-center text-sm">{qty}</span>
              <button
                onClick={() => {
                  const maxStock = activeVariant?.quantity ?? 999;
                  if (qty < maxStock) {
                    setQty((q) => q + 1);
                  }
                }}
                disabled={activeVariant ? qty >= activeVariant.quantity : false}
                className="px-2 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Increase"
              >
                <Plus size={14} />
              </button>
            </div>
            <Button onClick={add} variant="surface" className="flex-1">
              Add to cart
            </Button>
            <Button onClick={buy} className="flex-1">
              Buy now
            </Button>
          </div>

          <div className="mt-8 border border-border">
            <div className="border-b border-border bg-surface px-4 py-2 text-xs font-medium uppercase tracking-wider">
              Specifications
            </div>
            <dl className="divide-y divide-border text-sm">
              {product.specs.map((s: { label: string; value: string }) => (
                <div key={s.label} className="grid grid-cols-[140px_1fr] px-4 py-2">
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd dangerouslySetInnerHTML={{ __html: renderSpecValue(s.value) }} />
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 border-b border-border pb-3 text-lg font-semibold">
            You may also like
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
