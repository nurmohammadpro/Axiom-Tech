import { db, txDb } from "@/db";
import {
  products,
  productVariants,
  productSpecs,
  inventory,
  inventoryBalances,
  inventoryUnits,
  barcodes,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export type DeleteResult = { ok: true } | { ok: false; error: string; status: number };

/**
 * Delete a product and everything tied to it (variants, specs, barcodes,
 * inventory rows). Refuses to delete a product whose variants have received
 * stock units — those must be deactivated instead.
 */
export async function deleteProductById(productId: string): Promise<DeleteResult> {
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!existing) return { ok: false, error: "Product not found", status: 404 };

  const variants = await db
    .select({ id: productVariants.id, sku: productVariants.sku })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));

  for (const v of variants) {
    const [unitCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryUnits)
      .where(eq(inventoryUnits.variantId, v.id));
    if (unitCount.count > 0) {
      return {
        ok: false,
        error: "This product has received units — deactivate it instead of deleting",
        status: 409,
      };
    }
  }

  await txDb.transaction(async (tx) => {
    for (const v of variants) {
      await tx.delete(barcodes).where(eq(barcodes.variantId, v.id));
      await tx.delete(inventory).where(eq(inventory.sku, v.sku));
      await tx.delete(inventoryBalances).where(eq(inventoryBalances.variantId, v.id));
      await tx.delete(inventoryUnits).where(eq(inventoryUnits.variantId, v.id));
    }
    await tx.delete(productVariants).where(eq(productVariants.productId, productId));
    await tx.delete(productSpecs).where(eq(productSpecs.productId, productId));
    await tx.delete(products).where(eq(products.id, productId));
  });

  return { ok: true };
}
