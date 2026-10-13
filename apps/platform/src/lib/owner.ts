import { eq } from "drizzle-orm";
import postgres from "postgres";
import { db } from "@/db";
import { tenantEvents, tenants } from "@/db/schema";
import { connectionUrl } from "@/db/url";
import { hashPassword } from "./auth";
import { decryptSecret } from "./crypto";
import { DomainError } from "./domain";
import { directFromPooled } from "./neon";
import { sanitizeError } from "./provision";
import { generateTempPassword } from "./shop-seed";

export interface OwnerResetResult {
  ownerEmail: string;
  /** Shown once to the admin, never stored. */
  tempPassword: string;
}

/**
 * Replaces the shop owner's password with a new temporary one. The owner is the earliest-created
 * user with role "owner" in the shop's own database, so this still works after the owner changed
 * their email inside the shop. Serialised per shop by a row lock on the tenant.
 *
 * All sessions of the shop issued before the reset are revoked (tenants.sessions_valid_after,
 * enforced by the store proxy within the gate cache TTL, about 30 s).
 */
export async function resetOwnerPassword(tenantId: string, actorId: string | null): Promise<OwnerResetResult> {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).for("update");
    if (!t) throw new DomainError("Shop not found");
    if (t.status === "cancelled") throw new DomainError("Cancelled shops cannot be changed");
    if (t.provisionStatus !== "ready" || !t.dbUrlEncrypted) throw new DomainError("Shop is not set up yet");

    const client = postgres(connectionUrl(directFromPooled(decryptSecret(t.dbUrlEncrypted))), {
      max: 1,
      prepare: false,
      onnotice: () => {},
    });
    try {
      const tempPassword = generateTempPassword();
      const rows = await client`
        update users set password_hash = ${hashPassword(tempPassword)}, updated_at = now()
        where id = (select id from users where role = 'owner' order by created_at asc, id asc limit 1)
        returning email`;
      if (!rows.length) throw new DomainError("No owner account found in this shop");
      const ownerEmail = rows[0].email as string;
      await tx.insert(tenantEvents).values({ tenantId, type: "owner_password_reset", actorId, data: { ownerEmail } });
      // Everyone in this shop must sign in again (also kills any session an intruder may hold).
      await tx.update(tenants).set({ sessionsValidAfter: new Date(), updatedAt: new Date() }).where(eq(tenants.id, tenantId));
      return { ownerEmail, tempPassword };
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw new DomainError(`Could not reset the password: ${sanitizeError(e)}`);
    } finally {
      await client.end({ timeout: 5 });
    }
  });
}
