import { db } from "@/db";
import { exchangePolicies } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET all exchange policies
export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const policies = await db
    .select()
    .from(exchangePolicies)
    .orderBy(desc(exchangePolicies.createdAt));

  return NextResponse.json(policies);
}

// POST create new exchange policy
export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const body = await request.json();
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
      active = true,
    } = body;

    const [policy] = await db
      .insert(exchangePolicies)
      .values({
        name,
        description,
        month1Value: month1Value ?? 70,
        month2Value: month2Value ?? 60,
        month3Value: month3Value ?? 50,
        month6Value: month6Value ?? 40,
        month12Value: month12Value ?? 30,
        excellentConditionBonus: excellentConditionBonus ?? 5,
        goodConditionBonus: goodConditionBonus ?? 0,
        fairConditionPenalty: fairConditionPenalty ?? -10,
        poorConditionPenalty: poorConditionPenalty ?? -25,
        exchangeFee: exchangeFee ?? 0,
        minDeviceAge: minDeviceAge ?? 1,
        maxDeviceAge: maxDeviceAge ?? 24,
        active: active ?? true,
      })
      .returning();

    return NextResponse.json(policy, { status: 201 });
  } catch (error) {
    console.error("Exchange policy creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create exchange policy" },
      { status: 500 },
    );
  }
}
