import { db } from "@/db";
import { payrollItems, payrollRuns, staff } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id } = await params;
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await db
    .select({
      id: payrollItems.id,
      staffId: payrollItems.staffId,
      staffName: sql<string>`trim(concat(${staff.firstName}, ' ', ${staff.lastName}))`,
      baseSalary: payrollItems.baseSalary,
      allowances: payrollItems.allowances,
      deductions: payrollItems.deductions,
      grossSalary: payrollItems.grossSalary,
      totalDeductions: payrollItems.totalDeductions,
      netSalary: payrollItems.netSalary,
      notes: payrollItems.notes,
    })
    .from(payrollItems)
    .leftJoin(staff, eq(staff.id, payrollItems.staffId))
    .where(eq(payrollItems.payrollRunId, id))
    .orderBy(asc(staff.firstName));

  return NextResponse.json({ run, items });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id } = await params;
  const body = await request.json();
  const status = typeof body.status === "string" ? body.status : null;
  if (!status || !["draft", "finalized", "paid"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const [row] = await db
    .update(payrollRuns)
    .set({
      status,
      ...(status === "finalized" ? { finalizedAt: new Date() } : {}),
      ...(status === "paid" ? { paidAt: new Date() } : {}),
    })
    .where(eq(payrollRuns.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
