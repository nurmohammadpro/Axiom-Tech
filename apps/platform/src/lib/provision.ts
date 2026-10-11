import { addMinutes } from "date-fns";
import { and, eq, inArray, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { tenantEvents, tenants } from "@/db/schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { DomainError, rootDomain } from "./domain";
import { directFromPooled, getShopDbProvider, type ShopDbProvider } from "./neon";
import { applyStoreMigrations, seedShopDatabase } from "./shop-seed";

/** A claim older than this is treated as a crashed run and can be retried. */
const STALE_MINUTES = 10;

export interface ProvisionDeps {
  provider?: ShopDbProvider;
  migrationsDir?: string;
  now?: Date;
}

export interface ProvisionResult {
  shopUrl: string;
  ownerEmail: string;
  /** Present only when this run created the owner account. Show once, never stored. */
  tempPassword: string | null;
}

/** Strips connection strings and credentials from error text before it is stored or shown. */
export function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]").replace(/npg_\w+/g, "[redacted]").slice(0, 300);
}

/**
 * Creates the shop database, applies the store schema, seeds defaults and the owner account,
 * then marks the shop ready. Resumable: a failed run keeps the created database and retries
 * from the next step; a ready shop is never touched again.
 */
export async function provisionTenant(id: string, actorId: string | null, deps: ProvisionDeps = {}): Promise<ProvisionResult> {
  const now = deps.now ?? new Date();

  const [claimed] = await db
    .update(tenants)
    .set({ provisionStatus: "provisioning", provisionError: null, updatedAt: now })
    .where(
      and(
        eq(tenants.id, id),
        ne(tenants.status, "cancelled"),
        or(
          inArray(tenants.provisionStatus, ["pending", "failed"]),
          and(eq(tenants.provisionStatus, "provisioning"), lt(tenants.updatedAt, addMinutes(now, -STALE_MINUTES))),
        ),
      ),
    )
    .returning();

  if (!claimed) {
    const [t] = await db.select().from(tenants).where(eq(tenants.id, id));
    if (!t) throw new DomainError("Shop not found");
    if (t.status === "cancelled") throw new DomainError("Cancelled shops cannot be set up");
    if (t.provisionStatus === "ready") throw new DomainError("Shop is already set up");
    throw new DomainError("Setup is already running for this shop");
  }

  let step = "database";
  try {
    const provider = deps.provider ?? getShopDbProvider();
    let migrateUrl: string;

    if (claimed.dbUrlEncrypted) {
      // Retry after a partial run: reuse the database, and migrate over the direct (non-pooled) host.
      migrateUrl = directFromPooled(decryptSecret(claimed.dbUrlEncrypted));
    } else {
      const created = await provider.createShopDatabase(claimed.slug);
      await db
        .update(tenants)
        .set({
          neonDatabase: created.databaseName,
          neonRole: created.roleName,
          dbUrlEncrypted: encryptSecret(created.pooledUrl),
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, id));
      migrateUrl = created.directUrl;
    }

    step = "schema";
    await applyStoreMigrations(migrateUrl, deps.migrationsDir);

    step = "defaults";
    const { tempPassword } = await seedShopDatabase(migrateUrl, {
      shopName: claimed.name,
      ownerName: claimed.ownerName,
      ownerEmail: claimed.ownerEmail,
      ownerPhone: claimed.ownerPhone,
    });

    await db
      .update(tenants)
      .set({ provisionStatus: "ready", provisionError: null, provisionedAt: new Date(), updatedAt: new Date() })
      .where(eq(tenants.id, id));
    await db.insert(tenantEvents).values({ tenantId: id, type: "provisioned", actorId, data: { ownerCreated: tempPassword !== null } });

    return { shopUrl: `https://${claimed.slug}.${rootDomain()}`, ownerEmail: claimed.ownerEmail, tempPassword };
  } catch (e) {
    const message = `${step}: ${sanitizeError(e)}`;
    await db.update(tenants).set({ provisionStatus: "failed", provisionError: message, updatedAt: new Date() }).where(eq(tenants.id, id));
    await db.insert(tenantEvents).values({ tenantId: id, type: "provision_failed", actorId, data: { step, message } });
    throw new DomainError(`Setup failed at ${message}. Fix the cause and retry; completed steps are kept.`);
  }
}
