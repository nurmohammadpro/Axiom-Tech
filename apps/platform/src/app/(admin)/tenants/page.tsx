import Link from "next/link";
import { desc, eq, ilike, or, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { plans, tenants } from "@/db/schema";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { ShopsTable, type ShopRow } from "./shops-table";

const STATUSES = ["trial", "active", "suspended", "cancelled"] as const;

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser();
  const { status, q } = await searchParams;
  const filters = [];
  if (status && (STATUSES as readonly string[]).includes(status)) {
    filters.push(eq(tenants.status, status as (typeof STATUSES)[number]));
  } else if (!status) {
    // Default view hides deleted (cancelled) shops — "Delete" drops their
    // database and cancels them; they remain restorable via this filter.
    filters.push(sql`${tenants.status} <> 'cancelled'`);
  }
  if (q?.trim()) {
    const like = `%${q.trim().replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(tenants.name, like), ilike(tenants.slug, like), ilike(tenants.ownerEmail, like))!);
  }
  const rows = await db
    .select({ t: tenants, plan: plans.name })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(tenants.createdAt))
    .limit(200);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {can(user.role, "tenant:create") && <Link href="/tenants/new" className="btn btn-primary">New shop</Link>}
      </div>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, subdomain, email" className="input max-w-xs" />
        <select name="status" defaultValue={status ?? ""} className="input max-w-[10rem]">
          <option value="">All — except cancelled</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn">Filter</button>
      </form>
      <div className="card">
        <ShopsTable
          rows={rows.map(
            ({ t, plan }): ShopRow => ({
              id: t.id,
              name: t.name,
              slug: t.slug,
              ownerEmail: t.ownerEmail,
              plan,
              status: t.status,
              provisionStatus: t.provisionStatus,
              provisioned: Boolean(t.dbUrlEncrypted),
              activatedAt: t.activatedAt,
              trialEndsAt: t.trialEndsAt,
              currentPeriodEnd: t.currentPeriodEnd,
            }),
          )}
          perms={{
            pay: can(user.role, "tenant:payment"),
            suspend: can(user.role, "tenant:suspend"),
            cancel: can(user.role, "tenant:cancel"),
            reset: can(user.role, "tenant:reset_owner"),
          }}
        />
      </div>
    </div>
  );
}
