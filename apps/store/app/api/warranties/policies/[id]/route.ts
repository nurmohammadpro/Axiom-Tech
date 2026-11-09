import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { warrantyPolicies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { denyNonStaff } from "@/lib/authz";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyNonStaff(req.headers);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, durationValue, durationUnit, coverageType, terms, exclusions, active } = body;

    const [updatedPolicy] = await db
      .update(warrantyPolicies)
      .set({
        name: name || undefined,
        durationValue: durationValue !== undefined ? durationValue : undefined,
        durationUnit: durationUnit || undefined,
        coverageType: coverageType || undefined,
        terms: terms !== undefined ? terms : undefined,
        exclusions: exclusions !== undefined ? exclusions : undefined,
        active: active !== undefined ? active : undefined,
      })
      .where(eq(warrantyPolicies.id, parseInt(id)))
      .returning();

    if (!updatedPolicy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    return NextResponse.json(updatedPolicy);
  } catch (error) {
    console.error("Error updating warranty policy:", error);
    return NextResponse.json({ error: "Failed to update policy" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyNonStaff(req.headers);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const { id } = await params;
    const [deletedPolicy] = await db
      .delete(warrantyPolicies)
      .where(eq(warrantyPolicies.id, parseInt(id)))
      .returning();

    if (!deletedPolicy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting warranty policy:", error);
    return NextResponse.json({ error: "Failed to delete policy" }, { status: 500 });
  }
}
