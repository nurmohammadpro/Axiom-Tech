import { db } from "@/db";
import { staff, users } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getScope, requireOwner } from "@/lib/authz";
import { hashPassword } from "@/lib/auth";
import { str } from "@/lib/staff";

export const dynamic = "force-dynamic";

/** Granting/revoking system access is owner-only. */
async function guard(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }
  return null;
}

/** Grant a login to an existing staff profile (creates + links a user). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();
  const email = str(body.email);
  const password = str(body.password);
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const [record] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
  if (!record) return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  if (record.userId) {
    return NextResponse.json({ error: "This staff member already has access" }, { status: 409 });
  }

  const role = str(body.role) ?? (record.role !== "staff" ? record.role : "salesman");
  if (!["owner", "manager", "salesman"].includes(role)) {
    return NextResponse.json({ error: "Role must be owner, manager or salesman" }, { status: 400 });
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: hashPassword(password),
      firstName: record.firstName ?? "",
      lastName: record.lastName ?? "",
      role,
    })
    .returning();

  const [updated] = await db
    .update(staff)
    .set({ userId: user.id, role, updatedAt: new Date() })
    .where(eq(staff.id, id))
    .returning();

  return NextResponse.json({ ...updated, hasAccess: true, email: user.email });
}

/** Revoke access (unlinks and deletes the login). The profile stays. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;
  const [record] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
  if (!record) return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  if (!record.userId) {
    return NextResponse.json({ success: true, hasAccess: false });
  }

  const userId = record.userId;
  await db.update(staff).set({ userId: null, updatedAt: new Date() }).where(eq(staff.id, id));
  await db.delete(users).where(eq(users.id, userId));

  return NextResponse.json({ success: true, hasAccess: false });
}
