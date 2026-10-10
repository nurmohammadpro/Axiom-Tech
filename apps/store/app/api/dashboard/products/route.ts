import { db, txDb } from "@/db";
import {
  attributes,
  attributeValues,
  brands,
  categories,
  inventory,
  inventoryBalances,
  locations,
  products,
  productSpecs,
  productVariants,
  variantAttributeValues,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, like, desc } from "drizzle-orm";
import { generateSku } from "@/lib/identifiers";
import { findDuplicateProduct, resolveBrandId, resolveCategoryId } from "@/lib/catalog";
import { generateUniqueEAN13Barcode } from "@/lib/barcode";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  let conditions = undefined;
  if (search) {
    conditions = like(products.name, `%${search}%`);
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      originalPrice: products.originalPrice,
      short: products.short,
      inStock: products.inStock,
      brand: brands.name,
      category: categories.name,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(conditions)
    .orderBy(desc(products.createdAt));

  return NextResponse.json(rows);
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type Tx = Parameters<Parameters<typeof txDb.transaction>[0]>[0];

/** Resolve the location new stock is registered under: explicit > default > legacy. */
async function resolveLocation(locationId?: string): Promise<string> {
  if (locationId) {
    const [loc] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.name, locationId))
      .limit(1);
    if (loc) return loc.name;
  }
  const [def] = await db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.isDefault, true))
    .limit(1);
  if (!def?.name) throw new Error("No default warehouse configured");
  return def.name;
}

/** Mirror a variant's inline attributes into the canonical global attribute tables. */
async function syncVariantAttributes(
  tx: Tx,
  variantId: number,
  attrs: { name: string; value: string }[],
) {
  for (const a of attrs) {
    if (!a.name || !a.value) continue;
    const code = slug(a.name);
    let [attr] = await tx.select().from(attributes).where(eq(attributes.code, code)).limit(1);
    if (!attr) {
      [attr] = await tx.insert(attributes).values({ code, name: a.name }).returning();
    }
    let [av] = await tx
      .select()
      .from(attributeValues)
      .where(and(eq(attributeValues.attributeId, attr.id), eq(attributeValues.label, a.value)))
      .limit(1);
    if (!av) {
      [av] = await tx
        .insert(attributeValues)
        .values({ attributeId: attr.id, code: slug(a.value), label: a.value })
        .returning();
    }
    await tx
      .insert(variantAttributeValues)
      .values({ variantId, attributeValueId: av.id })
      .onConflictDoNothing();
  }
}

async function createVariant(
  tx: Tx,
  productId: string,
  v: {
    name?: string;
    attribute?: { name: string; value: string }[];
    sku?: string;
    barcode?: string;
    costPrice?: number | null;
    sellingPrice: number;
    quantity?: number | string;
    active?: boolean;
  },
  fallbackPrice: number,
  locationId: string,
  meta: { productName: string; brand?: string | null },
) {
  const attrs = (v.attribute || []) as { name: string; value: string }[];
  const autoName = attrs.map((a) => a.value).join(" / ");
  const baseName = autoName || v.name || "Default";
  const baseSku =
    String(v.sku || "").trim() ||
    generateSku({
      productName: meta.productName,
      productId,
      variantName: v.name,
      attributes: attrs,
      brand: meta.brand,
    });
  // Keep SKUs unique even when two variants share a name/attributes.
  let sku = baseSku;
  let n = 2;
  for (;;) {
    const [dup] = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.sku, sku))
      .limit(1);
    if (!dup) break;
    sku = `${baseSku}-${n++}`;
  }
  // Keep barcodes unique too — the legacy hash-based generator drew from a
  // ~10k item space and collided across products, so auto-generated labels are
  // now verified against existing variants. The tx sees variants inserted
  // earlier in this same request, so same-request collisions are covered.
  const barcode = v.barcode
    ? String(v.barcode)
    : await generateUniqueEAN13Barcode(async (code) => {
        const [dup] = await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(eq(productVariants.barcode, code))
          .limit(1);
        return Boolean(dup);
      });
  const qty = parseInt(String(v.quantity ?? 0)) || 0;

  const [variant] = await tx
    .insert(productVariants)
    .values({
      productId,
      name: baseName,
      attribute: attrs,
      sku,
      barcode,
      costPrice: v.costPrice ?? null,
      sellingPrice: v.sellingPrice ?? fallbackPrice,
      quantity: qty,
      active: v.active ?? true,
    })
    .returning();

  await syncVariantAttributes(tx, variant.id, attrs);

  await tx
    .insert(inventory)
    .values({
      productId,
      sku,
      quantity: qty,
      lowStockThreshold: 5,
      location: locationId,
    })
    .onConflictDoNothing();
  await tx
    .insert(inventoryBalances)
    .values({ variantId: variant.id, locationId, availableQty: qty })
    .onConflictDoNothing();

  return variant;
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await request.json();
  const {
    specs,
    variants: variantData,
    quantity,
    brand,
    category,
    productType,
    publishStatus,
    warrantyPolicyId,
    locationId,
    ...productData
  } = body;

  const resolvedLocation = await resolveLocation(locationId);

  // Look up brand and category IDs — case- and whitespace-insensitive, so a
  // product sent with "NIKE" still links the existing "Nike" brand instead of
  // silently saving with brand_id = null.
  const brandId = await resolveBrandId(brand);
  const categoryId = await resolveCategoryId(category);

  // Duplicate rule: same name + same category ("iPhone 13 Pro" as Official New
  // and as Pre-Owned Phones are two products; same name and category is a dup).
  const productName = String(productData.name ?? "").trim();
  const duplicate = await findDuplicateProduct({ name: productName, categoryId });
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

  const finalProductType = productType === "accessory" ? "accessory" : "new";
  const finalPublish =
    publishStatus === "draft" || publishStatus === "hidden" ? "draft" : "published";

  const { prod, variants } = await txDb.transaction(async (tx) => {
    const [created] = await tx
      .insert(products)
      .values({
        ...productData,
        name: productName,
        brandId,
        categoryId,
        productType: finalProductType,
        publishStatus: finalPublish,
        warrantyPolicyId: warrantyPolicyId ?? null,
      })
      .returning();

    // Specs
    if (specs?.length > 0) {
      await tx.insert(productSpecs).values(
        specs.map((s: { label: string; value: string }) => ({
          productId: created.id,
          label: s.label,
          value: s.value,
        })),
      );
    }

    const createdVariants = [];
    if (variantData?.length > 0) {
      for (const v of variantData) {
        createdVariants.push(
          await createVariant(tx, created.id, v, created.price, resolvedLocation, {
            productName: created.name,
            brand,
          }),
        );
      }
    } else {
      // Single default variant so the product is always sellable (POS/inventory join variants).
      createdVariants.push(
        await createVariant(
          tx,
          created.id,
          { sellingPrice: created.price },
          created.price,
          resolvedLocation,
          { productName: created.name, brand },
        ),
      );
    }

    return { prod: created, variants: createdVariants };
  });

  return NextResponse.json(
    {
      ...prod,
      variants: variants.map((v) => ({ id: v.id, sku: v.sku, barcode: v.barcode })),
    },
    { status: 201 },
  );
}
