export const dynamic = "force-dynamic";

import Link from "next/link";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { db } from "@/db";
import { payments, plans, tenants } from "@/db/schema";
import { taka } from "@/lib/domain";
import { fmtDate, daysUntil, methodLabel } from "@/lib/format";
import { tenantCounts } from "@/lib/tenants";
import { Stat, td, th } from "../ui";

export default async function Dashboard() {
  const now = new Date();
  const [counts, mrrRow, trialsEnding, renewals, recent] = await Promise.all([
    tenantCounts(),
    db
      .select({ v: sql<number>`coalesce(sum(${plans.monthlyPrice}), 0)::int` })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .where(eq(tenants.status, "active")),
    db
      .select()
      .from(tenants)
      .where(and(eq(tenants.status, "trial"), lte(tenants.trialEndsAt, addDays(now, 3)), gte(tenants.trialEndsAt, now)))
      .orderBy(tenants.trialEndsAt)
      .limit(10),
    db
      .select()
      .from(tenants)
      .where(and(eq(tenants.status, "active"), lte(tenants.currentPeriodEnd, addDays(now, 7))))
      .orderBy(tenants.currentPeriodEnd)
      .limit(10),
    db
      .select({ p: payments, shop: tenants.name, shopId: tenants.id })
      .from(payments)
      .innerJoin(tenants, eq(tenants.id, payments.tenantId))
      .orderBy(desc(payments.receivedAt))
      .limit(8),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Active" value={counts.active} />
        <Stat label="On trial" value={counts.trial} />
        <Stat label="Suspended" value={counts.suspended} />
        <Stat label="Cancelled" value={counts.cancelled} />
        <Stat label="MRR" value={taka(mrrRow[0]?.v ?? 0)} hint="Active shops, monthly price" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="px-4 pt-4 text-sm font-bold">Trials ending in 3 days</h2>
          <table className="mt-2 w-full">
            <tbody>
              {trialsEnding.length === 0 && <tr><td className={td} style={{ color: "var(--muted)" }}>None</td></tr>}
              {trialsEnding.map((t) => (
                <tr key={t.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className={td}><Link className="font-medium underline" href={`/tenants/${t.id}`}>{t.name}</Link></td>
                  <td className={td} style={{ color: "var(--muted)" }}>{fmtDate(t.trialEndsAt)} ({daysUntil(t.trialEndsAt)}d)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card overflow-hidden">
          <h2 className="px-4 pt-4 text-sm font-bold">Renewals due within 7 days</h2>
          <table className="mt-2 w-full">
            <tbody>
              {renewals.length === 0 && <tr><td className={td} style={{ color: "var(--muted)" }}>None</td></tr>}
              {renewals.map((t) => (
                <tr key={t.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className={td}><Link className="font-medium underline" href={`/tenants/${t.id}`}>{t.name}</Link></td>
                  <td className={td} style={{ color: "var(--muted)" }}>{fmtDate(t.currentPeriodEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 text-sm font-bold">Recent payments</h2>
        <table className="mt-2 w-full">
          <thead>
            <tr style={{ color: "var(--muted)" }}>
              <th className={th}>Shop</th><th className={th}>Kind</th><th className={th}>Amount</th><th className={th}>Method</th><th className={th}>Reference</th><th className={th}>Date</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && <tr><td colSpan={6} className={td} style={{ color: "var(--muted)" }}>No payments yet</td></tr>}
            {recent.map(({ p, shop, shopId }) => (
              <tr key={p.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className={td}><Link className="underline" href={`/tenants/${shopId}`}>{shop}</Link></td>
                <td className={`${td} capitalize`}>{p.kind}</td>
                <td className={td}>{taka(p.amount)}</td>
                <td className={td}>{methodLabel(p.method)}</td>
                <td className={td}>{p.reference ?? "-"}</td>
                <td className={td}>{fmtDate(p.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
