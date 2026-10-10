import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, products } from "@/db/schema";
import { normalizeName } from "@/lib/identifiers";

/**
 * Case- and whitespace-insensitive brand/category lookups so product saves link
 * the right brand/category ("NIKE" and " nike " find "Nike") instead of silently
 * nulling the FK — one of the root causes of duplicate products.
 */
export async function resolveBrandId(name: unknown): Promise<number | null> {
  const value = String(name ?? "").trim();
  if (!value) return null;
  const [row] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(sql`lower(btrim(${brands.name}))`, normalizeName(value)))
    .limit(1);
  return row?.id ?? null;
}

export async function resolveCategoryId(name: unknown): Promise<number | null> {
  const value = String(name ?? "").trim();
  if (!value) return null;
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(sql`lower(btrim(${categories.name}))`, normalizeName(value)))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Find an existing product with the same name in the same category — the
 * catalog's duplicate rule ("iPhone 13 Pro" as Official New and as Pre-Owned
 * Phones are two distinct products; same name + same category is a duplicate).
 */
export async function findDuplicateProduct(opts: {
  name: unknown;
  categoryId: number | null;
  excludeId?: string;
}): Promise<{ id: string; name: string; categoryName: string | null } | undefined> {
  const value = String(opts.name ?? "").trim();
  if (!value) return undefined;
  const sameCategory =
    opts.categoryId === null
      ? isNull(products.categoryId)
      : eq(products.categoryId, opts.categoryId);
  const [row] = await db
    .select({ id: products.id, name: products.name, categoryName: categories.name })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(sql`lower(btrim(${products.name}))`, normalizeName(value)),
        sameCategory,
        opts.excludeId ? ne(products.id, opts.excludeId) : undefined,
      ),
    )
    .limit(1);
  return row;
}
