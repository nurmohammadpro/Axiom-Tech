import { db } from "@/db";
import { exchangePolicies } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(req.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const {
      name,
      description,
      month1Value,
      month2Value,
      month3Value,
      month6Value,
      month12Value,
      excellentConditionBonus,
      goodConditionBonus,
      fairConditionPenalty,
      poorConditionPenalty,
      exchangeFee,
      minDeviceAge,
      maxDeviceAge,
      active,
    } = body;

    const [updatedPolicy] = await db
      .update(exchangePolicies)
      .set({
        name: name || undefined,
        description: description !== undefined ? description : undefined,
        month1Value: month1Value !== undefined ? month1Value : undefined,
        month2Value: month2Value !== undefined ? month2Value : undefined,
        month3Value: month3Value !== undefined ? month3Value : undefined,
        month6Value: month6Value !== undefined ? month6Value : undefined,
        month12Value: month12Value !== undefined ? month12Value : undefined,
        excellentConditionBonus:
          excellentConditionBonus !== undefined ? excellentConditionBonus : undefined,
        goodConditionBonus: goodConditionBonus !== undefined ? goodConditionBonus : undefined,
        fairConditionPenalty: fairConditionPenalty !== undefined ? fairConditionPenalty : undefined,
        poorConditionPenalty: poorConditionPenalty !== undefined ? poorConditionPenalty : undefined,
        exchangeFee: exchangeFee !== undefined ? exchangeFee : undefined,
        minDeviceAge: minDeviceAge !== undefined ? minDeviceAge : undefined,
        maxDeviceAge: maxDeviceAge !== undefined ? maxDeviceAge : undefined,
        active: active !== undefined ? active : undefined,
        updatedAt: new Date(),
      })
      .where(eq(exchangePolicies.id, parseInt(id)))
      .returning();

    if (!updatedPolicy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    return NextResponse.json(updatedPolicy);
  } catch (error) {
    console.error("Error updating exchange policy:", error);
    return NextResponse.json({ error: "Failed to update policy" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(req.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const { id } = await params;
    const [deletedPolicy] = await db
      .delete(exchangePolicies)
      .where(eq(exchangePolicies.id, parseInt(id)))
      .returning();

    if (!deletedPolicy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting exchange policy:", error);
    return NextResponse.json({ error: "Failed to delete policy" }, { status: 500 });
  }
}
