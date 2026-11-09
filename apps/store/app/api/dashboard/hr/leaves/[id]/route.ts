import { txDb } from "@/db";
import { leaveBalances, leaveRequests, leaveTypes } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getScope, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const FINAL = new Set(["approved", "rejected", "cancelled"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id } = await params;
  const body = await request.json();
  const status = str(body.status);
  if (!status || !["pending", "approved", "rejected", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const updated = await txDb.transaction(async (tx) => {
      const [req] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
      if (!req) return null;

      const wasApproved = req.status === "approved";
      const nowApproved = status === "approved";

      const [row] = await tx
        .update(leaveRequests)
        .set({ status, reviewedBy: scope.userId, reviewedAt: new Date(), updatedAt: new Date() })
        .where(eq(leaveRequests.id, id))
        .returning();

      // Keep the requested year's balance in step with the approval state.
      if (FINAL.has(status) || FINAL.has(req.status)) {
        const year = Number((req.startDate ?? "").slice(0, 4)) || new Date().getFullYear();
        const delta = (nowApproved ? req.days : 0) - (wasApproved ? req.days : 0);
        if (delta !== 0) {
          const [bal] = await tx
            .select()
            .from(leaveBalances)
            .where(
              and(
                eq(leaveBalances.staffId, req.staffId),
                eq(leaveBalances.leaveTypeId, req.leaveTypeId),
                eq(leaveBalances.year, year),
              ),
            )
            .limit(1);
          if (bal) {
            await tx
              .update(leaveBalances)
              .set({ usedDays: Math.max(0, bal.usedDays + delta) })
              .where(eq(leaveBalances.id, bal.id));
          } else {
            const [type] = await tx
              .select({ allowance: leaveTypes.annualAllowanceDays })
              .from(leaveTypes)
              .where(eq(leaveTypes.id, req.leaveTypeId))
              .limit(1);
            await tx.insert(leaveBalances).values({
              staffId: req.staffId,
              leaveTypeId: req.leaveTypeId,
              year,
              totalDays: type?.allowance ?? 0,
              usedDays: Math.max(0, delta),
            });
          }
        }
      }

      return row;
    });

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Leave update error:", error);
    return NextResponse.json({ error: "Failed to update leave" }, { status: 500 });
  }
}
