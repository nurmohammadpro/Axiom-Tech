import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, txDb } from "@/db";
import {
  categories,
  inventoryBatches,
  inventoryUnits,
  products,
  productVariants,
} from "@/db/schema";

/**
 * Batch-aware FIFO selling.
 *
 * A "batch" is one receiving event for a variant, carrying the rate it was
 * bought at. For **official** categories (slug starts with "official"),
 * serialized units are always sold oldest-batch-first, and a unit from a
 * newer batch is not sellable while an older batch still has stock **at the
 * same warehouse**. Pre-owned and unofficial-new stock has no batch lock —
 * any available unit can sell in any order (auto-pick still prefers the
 * oldest). Ordering is keyed on where the units physically are, not on the
 * batch's original warehouse, so a transferred unit isn't wrongly locked.
 * This module is the single source of that rule.
 */

/**
 * Variants whose selling is FIFO batch-locked: only categories whose slug
 * starts with "official" enforce oldest-batch-first. Everything else
 * (pre-owned phones, unofficial new, accessories) sells freely.
 */
export async function fifoEnforcedVariantIds(
  client: FifoClient,
  variantIds: number[],
): Promise<Set<number>> {
  if (variantIds.length === 0) return new Set();
  const c = client as typeof db;
  const rows = await c
    .select({ variantId: productVariants.id, slug: categories.slug })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(inArray(productVariants.id, variantIds));
  const enforced = new Set<number>();
  for (const row of rows) {
    if ((row.slug ?? "").trim().toLowerCase().startsWith("official")) {
      enforced.add(row.variantId);
    }
  }
  return enforced;
}

type Tx = Parameters<Parameters<typeof txDb.transaction>[0]>[0];
/** Accepts the pooled client or a transaction so reads can stay inside a commit. */
export type FifoClient = typeof db | Tx;

export type Batch = typeof inventoryBatches.$inferSelect;
export type Unit = typeof inventoryUnits.$inferSelect;

/** Stable key for a variant's batch ordering at one warehouse ("" = no location). */
export function batchLocKey(variantId: number, locationId: string | null): string {
  return `${variantId}|${locationId ?? ""}`;
}

/** An open batch: still has available units, at a specific warehouse. */
export interface OpenBatch {
  batch: Batch;
  locationId: string | null;
  available: number;
}

/** Batches that still have available units, oldest received first. */
export async function openBatches(client: FifoClient, variantIds?: number[]): Promise<OpenBatch[]> {
  const c = client as typeof db;
  if (variantIds && variantIds.length === 0) return [];
  return c
    .select({
      batch: inventoryBatches,
      locationId: inventoryUnits.locationId,
      available: sql<number>`count(*)::int`,
    })
    .from(inventoryBatches)
    .innerJoin(
      inventoryUnits,
      and(eq(inventoryUnits.batchId, inventoryBatches.id), eq(inventoryUnits.status, "available")),
    )
    .where(variantIds ? inArray(inventoryBatches.variantId, variantIds) : undefined)
    .groupBy(inventoryBatches.id, inventoryUnits.locationId)
    .orderBy(asc(inventoryBatches.receivedAt), asc(inventoryBatches.id));
}

/** The batch that must be sold before any other, for a variant at one warehouse. */
export async function oldestOpenBatch(
  client: FifoClient,
  variantId: number,
  locationId: string | null,
): Promise<Batch | null> {
  const open = await openBatches(client, [variantId]);
  const hit = open.find((o) => (o.locationId ?? null) === (locationId ?? null));
  return hit?.batch ?? null;
}

/** Map of `variantId|locationId` -> the oldest open batch id at that warehouse. */
export async function oldestOpenBatchIds(
  client: FifoClient,
  variantIds: number[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const { batch, locationId } of await openBatches(client, variantIds)) {
    const key = batchLocKey(batch.variantId, locationId);
    if (!map.has(key)) map.set(key, batch.id);
  }
  return map;
}

export async function getBatchById(client: FifoClient, batchId: string): Promise<Batch | null> {
  const c = client as typeof db;
  const [row] = await c
    .select()
    .from(inventoryBatches)
    .where(eq(inventoryBatches.id, batchId))
    .limit(1);
  return row ?? null;
}

export type SellabilityInput = Pick<Unit, "status" | "variantId" | "locationId" | "batchId">;

/**
 * A unit is sellable when it is `available` and — for FIFO-enforced
 * (official) variants — it belongs to the oldest open batch at its own
 * warehouse (or has no batch and nothing batched is older). Non-enforced
 * variants (pre-owned, unofficial new) sell in any order.
 */
export async function isUnitSellable(
  client: FifoClient,
  unit: SellabilityInput,
): Promise<{ sellable: boolean; oldest: Batch | null; oldestAvailable: number }> {
  if (unit.status !== "available") return { sellable: false, oldest: null, oldestAvailable: 0 };
  const enforced = (await fifoEnforcedVariantIds(client, [unit.variantId])).has(unit.variantId);
  const open = await openBatches(client, [unit.variantId]);
  const atWarehouse = open.find((o) => (o.locationId ?? null) === (unit.locationId ?? null));
  const oldest = atWarehouse?.batch ?? null;
  const oldestAvailable = atWarehouse?.available ?? 0;
  if (!enforced) return { sellable: true, oldest, oldestAvailable };
  const sellable = unit.batchId ? oldest?.id === unit.batchId : oldest === null;
  return { sellable, oldest, oldestAvailable };
}

/**
 * Pick the units to sell for a serialized line. FIFO-enforced (official)
 * variants go oldest open batch first, then oldest unit within the batch.
 * Non-enforced variants pick any available unit, still oldest-first as a
 * preference. When `locationId` is null ("All locations") the FIFO path walks
 * warehouses in the order of their oldest open batch.
 */
export async function fifoSellableUnits(
  client: FifoClient,
  variantId: number,
  locationId: string | null,
  quantity: number,
): Promise<Unit[]> {
  const c = client as typeof db;

  const enforced = (await fifoEnforcedVariantIds(client, [variantId])).has(variantId);
  if (!enforced) {
    return c
      .select()
      .from(inventoryUnits)
      .where(
        and(
          eq(inventoryUnits.variantId, variantId),
          eq(inventoryUnits.status, "available"),
          locationId ? eq(inventoryUnits.locationId, locationId) : undefined,
        ),
      )
      .orderBy(
        asc(inventoryUnits.receivedAt),
        asc(inventoryUnits.createdAt),
        asc(inventoryUnits.id),
      )
      .limit(quantity);
  }

  const open = await openBatches(client, [variantId]);

  // openBatches is oldest-first, so the first time a warehouse appears is its
  // oldest open batch; warehouse order therefore follows batch age.
  const oldestByLocation = new Map<string, OpenBatch>();
  const locationOrder: string[] = [];
  for (const row of open) {
    const key = row.locationId ?? "";
    if (locationId && key !== locationId) continue;
    if (!oldestByLocation.has(key)) {
      oldestByLocation.set(key, row);
      locationOrder.push(key);
    }
  }

  const picked: Unit[] = [];
  for (const key of locationOrder) {
    if (picked.length >= quantity) break;
    const { batch, locationId: loc } = oldestByLocation.get(key)!;
    const rows = await c
      .select()
      .from(inventoryUnits)
      .where(
        and(
          eq(inventoryUnits.variantId, variantId),
          eq(inventoryUnits.status, "available"),
          eq(inventoryUnits.batchId, batch.id),
          loc ? eq(inventoryUnits.locationId, loc) : isNull(inventoryUnits.locationId),
        ),
      )
      .orderBy(
        asc(inventoryUnits.receivedAt),
        asc(inventoryUnits.createdAt),
        asc(inventoryUnits.id),
      )
      .limit(quantity - picked.length);
    picked.push(...rows);
  }

  // Legacy safety net: unbatched units stay sellable only when no batched stock
  // is available (batches are always preferential).
  if (picked.length < quantity) {
    const rows = await c
      .select()
      .from(inventoryUnits)
      .where(
        and(
          eq(inventoryUnits.variantId, variantId),
          eq(inventoryUnits.status, "available"),
          isNull(inventoryUnits.batchId),
          locationId ? eq(inventoryUnits.locationId, locationId) : undefined,
        ),
      )
      .orderBy(asc(inventoryUnits.receivedAt), asc(inventoryUnits.id))
      .limit(quantity - picked.length);
    picked.push(...rows);
  }

  return picked;
}

/** Human label for lock errors, e.g. "BATCH-20260913-0001 (received 13 Sep 2026)". */
export function batchLabel(batch: Batch): string {
  const when = batch.receivedAt
    ? new Date(batch.receivedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "unknown date";
  return `${batch.batchNumber} (received ${when})`;
}
