export const dynamic = "force-dynamic";

import Link from "next/link";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { db } from "@/db";
import { payments, plans, tenants } from "@/db/schema";
import { taka } from "@/lib/domain";
import { tenantCounts } from "@/lib/tenants";
import { billingTotals } from "@/lib/invoices";
import { Stat } from "../../ui";
import { RecentPaymentsTable, RenewalsTable, TrialsEndingTable } from "./admin-tables";

export default async function Dashboard() {
  const now = new Date();
  const [counts, mrrRow, trialsEnding, renewals, recent, billing] = await Promise.all([
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
    billingTotals(now),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active" value={counts.active} />
        <Stat label="On trial" value={counts.trial} />
        <Stat label="Suspended" value={counts.suspended} />
        <Stat label="Cancelled" value={counts.cancelled} />
        <Stat label="MRR" value={taka(mrrRow[0]?.v ?? 0)} hint="Active shops, monthly price" />
        <Stat label="Collected this month" value={taka(billing.collectedThisMonth)} hint="All payments received" />
        <Stat label="Outstanding" value={taka(billing.outstanding)} hint="Due invoices" />
        <Stat label="Overdue" value={taka(billing.overdue)} hint="Due invoices past due date" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="px-4 pt-4 text-sm font-bold">Trials ending in 3 days</h2>
          <div className="mt-2 px-2 pb-2">
            <TrialsEndingTable
              rows={trialsEnding.map((t) => ({ id: t.id, name: t.name, date: t.trialEndsAt }))}
            />
          </div>
        </section>

        <section className="card overflow-hidden">
          <h2 className="px-4 pt-4 text-sm font-bold">Renewals due within 7 days</h2>
          <div className="mt-2 px-2 pb-2">
            <RenewalsTable
              rows={renewals.map((t) => ({ id: t.id, name: t.name, date: t.currentPeriodEnd }))}
            />
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="px-4 pt-4 text-sm font-bold">Recent payments</h2>
        <div className="mt-2 px-2 pb-2">
          <RecentPaymentsTable
            rows={recent.map(({ p, shop, shopId }) => ({
              id: p.id,
              shop,
              shopId,
              kind: p.kind,
              amount: p.amount,
              method: p.method,
              reference: p.reference,
              receivedAt: p.receivedAt,
            }))}
          />
        </div>
      </section>
    </div>
  );
}
