import { and, eq, gte, lte } from "drizzle-orm";
import { txDb } from "@/db";
import { leaveRequests, leaveTypes, payrollItems, payrollRuns, staff } from "@/db/schema";

/** Inclusive number of calendar days between two YYYY-MM-DD dates. */
export function periodDays(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00`).getTime();
  const e = new Date(`${end}T00:00:00`).getTime();
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}

/**
 * Generate a DRAFT payroll run for a period.
 *
 * Model (owner-confirmed): fixed monthly salary per staff, broken into
 * basic + allowances (housing/transport/medical/other), with automatic
 * deductions for provident fund (% of basic) and approved UNPAID leave days
 * prorated by `days × gross / daysInPeriod`. Items can be edited afterwards;
 * designed to also accept attendance deductions later without a shape change.
 */
export async function generatePayrollRun(
  periodStart: string,
  periodEnd: string,
  createdBy: string | null,
) {
  return txDb.transaction(async (tx) => {
    const people = await tx.select().from(staff).where(eq(staff.isActive, true));

    const days = periodDays(periodStart, periodEnd);
    const items: (typeof payrollItems.$inferInsert)[] = [];
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const p of people) {
      // basic_salary is the new structure; fall back to legacy monthly_salary.
      const basic = p.basicSalary ?? p.monthlySalary ?? 0;
      const allowanceParts = [
        { label: "Housing allowance", amount: p.housingAllowance ?? 0 },
        { label: "Transport allowance", amount: p.transportAllowance ?? 0 },
        { label: "Medical allowance", amount: p.medicalAllowance ?? 0 },
        { label: "Other allowance", amount: p.otherAllowance ?? 0 },
      ].filter((a) => a.amount > 0);
      const allowanceTotal = allowanceParts.reduce((s, a) => s + a.amount, 0);
      const gross = basic + allowanceTotal;
      if (gross <= 0) continue;

      const unpaidRows = await tx
        .select({ days: leaveRequests.days })
        .from(leaveRequests)
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .where(
          and(
            eq(leaveRequests.staffId, p.id),
            eq(leaveRequests.status, "approved"),
            eq(leaveTypes.paid, false),
            lte(leaveRequests.startDate, periodEnd),
            gte(leaveRequests.endDate, periodStart),
          ),
        );
      const unpaidDays = unpaidRows.reduce((s, r) => s + (r.days ?? 0), 0);
      const unpaidDeduction = Math.round((unpaidDays * gross) / days);

      const pfRate = p.providentFundRate ?? 0;
      const providentFund = Math.round((basic * pfRate) / 100);

      const deductions = [
        ...(providentFund > 0
          ? [{ label: `Provident fund (${pfRate}%)`, amount: providentFund }]
          : []),
        ...(unpaidDays > 0
          ? [{ label: `Unpaid leave (${unpaidDays}d)`, amount: unpaidDeduction }]
          : []),
      ];
      const totalDed = deductions.reduce((s, d) => s + d.amount, 0);
      const net = Math.max(0, gross - totalDed);

      totalGross += gross;
      totalDeductions += totalDed;
      totalNet += net;

      items.push({
        payrollRunId: "", // set after the run is inserted
        staffId: p.id,
        baseSalary: basic,
        allowances: allowanceParts,
        deductions,
        grossSalary: gross,
        totalDeductions: totalDed,
        netSalary: net,
      });
    }

    const [run] = await tx
      .insert(payrollRuns)
      .values({
        periodStart,
        periodEnd,
        status: "draft",
        createdBy,
        totalGross,
        totalDeductions,
        totalNet,
      })
      .returning();

    if (items.length) {
      await tx.insert(payrollItems).values(items.map((i) => ({ ...i, payrollRunId: run.id })));
    }

    return { run, itemCount: items.length };
  });
}
