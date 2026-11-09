import { db } from "@/db";
import { payrollItems, payrollRuns } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { count, desc } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";
import { generatePayrollRun } from "@/lib/payroll";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const runs = await db.select().from(payrollRuns).orderBy(desc(payrollRuns.createdAt));
  const counts = await db
    .select({ runId: payrollItems.payrollRunId, n: count() })
    .from(payrollItems)
    .groupBy(payrollItems.payrollRunId);
  const countByRun = new Map(counts.map((c) => [c.runId, Number(c.n)]));

  return NextResponse.json(runs.map((r) => ({ ...r, itemCount: countByRun.get(r.id) ?? 0 })));
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const body = await request.json();
  const periodStart = typeof body.periodStart === "string" ? body.periodStart : null;
  const periodEnd = typeof body.periodEnd === "string" ? body.periodEnd : null;
  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "periodStart and periodEnd are required" }, { status: 400 });
  }

  try {
    const outcome = await generatePayrollRun(periodStart, periodEnd, scope.userId);
    return NextResponse.json(outcome, { status: 201 });
  } catch (error) {
    console.error("Payroll generation error:", error);
    return NextResponse.json({ error: "Failed to generate payroll" }, { status: 500 });
  }
}
