export const dynamic = "force-dynamic";

import { db } from "@/db";
import { products, productSpecs, productVariants, brands, categories } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { generateSku } from "@/lib/identifiers";
import { findDuplicateProduct, resolveBrandId, resolveCategoryId } from "@/lib/catalog";
import { deleteProductById } from "@/lib/product-delete";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { id } = await params;
  const [row] = await db
    .select({
      id: products.id,
      name: products.name,
      brand: brands.name,
      category: categories.name,
      price: products.price,
      costPrice: products.costPrice,
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
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const specs = await db.select().from(productSpecs).where(eq(productSpecs.productId, id));
  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(productVariants.id);

  return NextResponse.json({ ...row, specs, variants });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { id } = await params;
  const body = await request.json();
  // `quantity` is intentionally dropped: stock is managed exclusively through the
  // Inventory page, never the catalog editor.
  const {
    specs,
    variants: variantData,
    quantity: _ignored,
    brand,
    category,
    ...productData
  } = body;

  // `brand`/`category` are names from the edit form; resolve them to FK ids
  // case-insensitively (mirrors POST). They must not be written verbatim —
  // writing the category NAME into the products.category condition column was
  // corrupting that column on every edit.
  const brandId = brand === undefined ? undefined : await resolveBrandId(brand);
  const categoryId = category === undefined ? undefined : await resolveCategoryId(category);
  const productName = productData.name === undefined ? undefined : String(productData.name).trim();

  const [current] = await db
    .select({ categoryId: products.categoryId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Duplicate rule: same name + same category, excluding this product itself.
  const duplicate = await findDuplicateProduct({
    name: productName ?? "",
    categoryId: categoryId === undefined ? current.categoryId : categoryId,
    excludeId: id,
  });
  if (duplicate) {
    const catLabel = duplicate.categoryName ?? "no category";
    return NextResponse.json(
      {
        error:
          'A product named "' + duplicate.name + '" already exists in category "' + catLabel + '"',
      },
      { status: 409 },
    );
  }

  const [prod] = await db
    .update(products)
    .set({
      ...productData,
      ...(productName !== undefined && { name: productName }),
      ...(brandId !== undefined && { brandId }),
      ...(categoryId !== undefined && { categoryId }),
    })
    .where(eq(products.id, id))
    .returning();

  if (!prod) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (specs) {
    await db.delete(productSpecs).where(eq(productSpecs.productId, id));
    if (specs.length > 0) {
      await db.insert(productSpecs).values(
        specs.map((s: { label: string; value: string }) => ({
          productId: id,
          label: s.label,
          value: s.value,
        })),
      );
    }
  }

  const [product] = await db
    .select({ name: products.name, brand: brands.name })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .where(eq(products.id, id))
    .limit(1);

  if (variantData) {
    // Replacing all variants — delete existing and recreate. On-hand stock must
    // survive the edit, so preserve the current quantity by SKU.
    const existing = await db
      .select({ sku: productVariants.sku, quantity: productVariants.quantity })
      .from(productVariants)
      .where(eq(productVariants.productId, id));
    const qtyBySku = new Map(existing.map((v) => [v.sku, v.quantity]));
    await db.delete(productVariants).where(eq(productVariants.productId, id));
    if (variantData.length > 0) {
      for (const v of variantData) {
        const attrs = (v.attribute || []) as { name: string; value: string }[];
        const autoName = attrs.map((a) => a.value).join(" / ");
        const baseSku =
          v.sku ||
          generateSku({
            productName: product?.name ?? "Product",
            productId: id,
            variantName: v.name,
            attributes: attrs,
            brand: product?.brand,
          });
        // Keep SKUs unique even when two variants share a name/attributes.
        let sku = baseSku;
        let n = 2;
        for (;;) {
          const [dup] = await db
            .select({ id: productVariants.id })
            .from(productVariants)
            .where(eq(productVariants.sku, sku))
            .limit(1);
          if (!dup) break;
          sku = `${baseSku}-${n++}`;
        }
        await db.insert(productVariants).values({
          productId: id,
          name: autoName || v.name || "Variant",
          attribute: attrs,
          sku,
          costPrice: v.costPrice || null,
          sellingPrice: v.sellingPrice,
          quantity: qtyBySku.get(sku) ?? 0,
        });
      }
    }
  } else if (productData.price !== undefined || productData.costPrice !== undefined) {
    const existingVariants = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, id));

    // Products without explicit options use one default variant everywhere else
    // in the app, so keep that variant's prices aligned with the product record.
    if (existingVariants.length === 1) {
      await db
        .update(productVariants)
        .set({
          ...(productData.price !== undefined && { sellingPrice: productData.price }),
          ...(productData.costPrice !== undefined && { costPrice: productData.costPrice }),
          updatedAt: new Date(),
        })
        .where(eq(productVariants.id, existingVariants[0].id));
    }
  }

  return NextResponse.json(prod);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { id } = await params;
  const result = await deleteProductById(id);

  if (result.ok) return NextResponse.json({ success: true });
  return NextResponse.json({ error: result.error }, { status: result.status });
}
