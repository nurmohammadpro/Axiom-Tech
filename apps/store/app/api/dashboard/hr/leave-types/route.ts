import { db } from "@/db";
import { leaveTypes } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const rows = await db.select().from(leaveTypes).orderBy(leaveTypes.name);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const body = await request.json();
  const name = str(body.name);
  const code = str(body.code);
  if (!name || !code) {
    return NextResponse.json({ error: "Name and code are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(leaveTypes)
    .values({
      name,
      code,
      color: str(body.color) ?? "#2563eb",
      paid: body.paid ?? true,
      annualAllowanceDays: int(body.annualAllowanceDays),
      requiresApproval: body.requiresApproval ?? true,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const body = await request.json();
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const [row] = await db
    .update(leaveTypes)
    .set({
      ...(body.name !== undefined ? { name: str(body.name) ?? "" } : {}),
      ...(body.color !== undefined ? { color: str(body.color) ?? "#2563eb" } : {}),
      ...(body.paid !== undefined ? { paid: Boolean(body.paid) } : {}),
      ...(body.annualAllowanceDays !== undefined
        ? { annualAllowanceDays: int(body.annualAllowanceDays) }
        : {}),
      ...(body.requiresApproval !== undefined
        ? { requiresApproval: Boolean(body.requiresApproval) }
        : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leaveTypes.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(leaveTypes).where(eq(leaveTypes.id, id));
  return NextResponse.json({ success: true });
}
