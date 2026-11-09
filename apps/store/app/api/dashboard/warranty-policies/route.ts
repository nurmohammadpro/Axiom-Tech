import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { warrantyPolicies } from "@/db/schema";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const rows = await db
    .select()
    .from(warrantyPolicies)
    .where(eq(warrantyPolicies.active, true))
    .orderBy(warrantyPolicies.name);
  return NextResponse.json(rows);
}
