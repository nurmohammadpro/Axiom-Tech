import Link from "next/link";
import { desc, eq, ilike, or, and } from "drizzle-orm";
import { db } from "@/db";
import { plans, tenants } from "@/db/schema";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { Badge, td, th } from "../../ui";
import { RowActions } from "./row-actions";

const STATUSES = ["trial", "active", "suspended", "cancelled"] as const;

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser();
  const { status, q } = await searchParams;
  const filters = [];
  if (status && (STATUSES as readonly string[]).includes(status)) filters.push(eq(tenants.status, status as (typeof STATUSES)[number]));
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
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ color: "var(--muted-foreground)" }}>
              <th className={th}>Shop</th><th className={th}>Plan</th><th className={th}>Status</th><th className={th}>Setup</th><th className={th}>Trial ends</th><th className={th}>Paid until</th><th className={th}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className={td} style={{ color: "var(--muted-foreground)" }}>No shops found</td></tr>}
            {rows.map(({ t, plan }) => (
              <tr key={t.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className={td}>
                  <Link href={`/tenants/${t.id}`} className="font-semibold underline">{t.name}</Link>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{t.slug} · {t.ownerEmail}</div>
                </td>
                <td className={td}>{plan}</td>
                <td className={td}><Badge value={t.status} /></td>
                <td className={td}><Badge value={t.provisionStatus} /></td>
                <td className={td}>{t.activatedAt ? "-" : fmtDate(t.trialEndsAt)}</td>
                <td className={td}>{fmtDate(t.currentPeriodEnd)}</td>
                <td className={`${td} text-right`}>
                  <RowActions
                    t={{ id: t.id, slug: t.slug, status: t.status, activatedAt: Boolean(t.activatedAt), provisioned: Boolean(t.dbUrlEncrypted) }}
                    perms={{
                      pay: can(user.role, "tenant:payment"),
                      suspend: can(user.role, "tenant:suspend"),
                      cancel: can(user.role, "tenant:cancel"),
                      reset: can(user.role, "tenant:reset_owner"),
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
