export const dynamic = "force-dynamic";

import { db } from "@/db";
import { products, productSpecs, productVariants, brands, categories } from "@/db/schema";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      brand: brands.name,
      category: categories.name,
      price: products.price,
      originalPrice: products.originalPrice,
      short: products.short,
      description: products.description,
      bgColor: products.bgColor,
      textColor: products.textColor,
      inStock: products.inStock,
      images: products.images,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id));

  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const specs = await db.select().from(productSpecs).where(eq(productSpecs.productId, id));
  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(productVariants.id);
  return NextResponse.json({ ...product, specs, variants });
}
