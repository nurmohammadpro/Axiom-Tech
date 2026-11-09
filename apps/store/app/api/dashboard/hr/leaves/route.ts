import { db } from "@/db";
import { leaveRequests, leaveTypes, staff } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getScope, requireStaff } from "@/lib/authz";
import { periodDays } from "@/lib/payroll";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const rows = await db
    .select({
      id: leaveRequests.id,
      staffId: leaveRequests.staffId,
      staffName: sql<string>`trim(concat(${staff.firstName}, ' ', ${staff.lastName}))`,
      leaveTypeId: leaveRequests.leaveTypeId,
      leaveTypeName: leaveTypes.name,
      paid: leaveTypes.paid,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      reviewedAt: leaveRequests.reviewedAt,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .leftJoin(staff, eq(staff.id, leaveRequests.staffId))
    .leftJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .orderBy(desc(leaveRequests.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const body = await request.json();
  const staffId = str(body.staffId);
  const leaveTypeId = Number(body.leaveTypeId);
  const startDate = str(body.startDate);
  const endDate = str(body.endDate);
  if (!staffId || !Number.isInteger(leaveTypeId) || !startDate || !endDate) {
    return NextResponse.json(
      { error: "staffId, leaveTypeId, startDate and endDate are required" },
      { status: 400 },
    );
  }

  const days =
    Number.isFinite(Number(body.days)) && Number(body.days) > 0
      ? Math.round(Number(body.days))
      : periodDays(startDate, endDate);

  const [row] = await db
    .insert(leaveRequests)
    .values({
      staffId,
      leaveTypeId,
      startDate,
      endDate,
      days,
      reason: str(body.reason),
      status: "pending",
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
