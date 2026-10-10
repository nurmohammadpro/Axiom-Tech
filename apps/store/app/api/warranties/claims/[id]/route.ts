import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { warrantyClaims, warrantyEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, diagnosis, resolution, cost, assignedTo } = body;

    // Build update object — only set fields that are provided
    const update: Record<string, any> = {};
    if (status !== undefined) update.status = status;
    if (diagnosis !== undefined) update.diagnosis = diagnosis;
    if (resolution !== undefined) update.resolution = resolution;
    if (cost !== undefined) update.cost = cost;
    if (assignedTo !== undefined) update.assignedTo = assignedTo;
    if (status === "resolved" || status === "rejected") {
      update.resolvedAt = new Date();
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(warrantyClaims)
      .set(update)
      .where(eq(warrantyClaims.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    // Write audit events for each changed field
    if (status) {
      await db.insert(warrantyEvents).values({
        claimId: id,
        eventType: "status_change",
        note: `Status changed to ${status}`,
      });
    }
    if (diagnosis) {
      await db.insert(warrantyEvents).values({
        claimId: id,
        eventType: "diagnosis",
        note: diagnosis,
      });
    }
    if (resolution) {
      await db.insert(warrantyEvents).values({
        claimId: id,
        eventType: "resolution",
        note: resolution,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating warranty claim:", error);
    return NextResponse.json({ error: "Failed to update claim" }, { status: 500 });
  }
}
