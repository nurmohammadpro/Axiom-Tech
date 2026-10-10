import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { warrantyPolicies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

// GET /api/dashboard/warranties - List all active warranty policies
export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const policies = await db
      .select()
      .from(warrantyPolicies)
      .where(eq(warrantyPolicies.active, true))
      .orderBy(warrantyPolicies.name);

    return NextResponse.json(policies);
  } catch (error) {
    console.error("Error fetching warranty policies:", error);
    return NextResponse.json({ error: "Failed to fetch warranty policies" }, { status: 500 });
  }
}

// POST /api/dashboard/warranties - Create new warranty policy
export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const body = await request.json();
    const { name, durationValue, durationUnit, coverageType, terms, exclusions } = body;

    if (!name || !durationValue || !durationUnit) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const [newPolicy] = await db
      .insert(warrantyPolicies)
      .values({
        name,
        durationValue: Number(durationValue),
        durationUnit: durationUnit || "months",
        coverageType: coverageType || "standard",
        terms: terms || null,
        exclusions: exclusions || null,
        active: true,
      })
      .returning();

    return NextResponse.json(newPolicy, { status: 201 });
  } catch (error) {
    console.error("Error creating warranty policy:", error);
    return NextResponse.json({ error: "Failed to create warranty policy" }, { status: 500 });
  }
}
