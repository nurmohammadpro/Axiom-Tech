import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { warrantyPolicies } from "@/db/schema";
import { denyNonStaff } from "@/lib/authz";

export async function GET(req: NextRequest) {
  try {
    const policies = await db.select().from(warrantyPolicies).orderBy(warrantyPolicies.id);

    return NextResponse.json(policies);
  } catch (error) {
    console.error("Error fetching warranty policies:", error);
    return NextResponse.json({ error: "Failed to fetch policies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await denyNonStaff(req.headers);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  try {
    const body = await req.json();
    const { name, durationValue, durationUnit, coverageType, terms, exclusions, active } = body;

    if (!name || !durationValue || !durationUnit) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const [newPolicy] = await db
      .insert(warrantyPolicies)
      .values({
        name,
        durationValue,
        durationUnit,
        coverageType: coverageType || "standard",
        terms: terms || null,
        exclusions: exclusions || null,
        active: active !== false,
      })
      .returning();

    return NextResponse.json(newPolicy, { status: 201 });
  } catch (error) {
    console.error("Error creating warranty policy:", error);
    return NextResponse.json({ error: "Failed to create policy" }, { status: 500 });
  }
}
