export const dynamic = "force-dynamic";

import { db } from "@/db";
import { staff, users } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getScope, requireOwner } from "@/lib/authz";
import { str, profileColumns } from "@/lib/staff";

/** Staff records can only be changed by the store owner. */
async function guard(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }
  return null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();
  const profile = profileColumns(body);

  const [record] = await db
    .update(staff)
    .set({
      ...profile,
      updatedAt: new Date(),
      ...(body.role !== undefined ? { role: str(body.role) ?? "staff" } : {}),
      ...(body.storeLocation !== undefined ? { storeLocation: str(body.storeLocation) } : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
    })
    .where(eq(staff.id, id))
    .returning();

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Keep the linked login's name in sync when access exists.
  if (record.userId && (profile.firstName || profile.lastName)) {
    await db
      .update(users)
      .set({
        firstName: profile.firstName ?? undefined,
        lastName: profile.lastName ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, record.userId));
  }

  return NextResponse.json(record);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;
  const [record] = await db.delete(staff).where(eq(staff.id, id)).returning();

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Removing a staff member removes their login too (no orphaned access).
  if (record.userId) {
    await db.delete(users).where(eq(users.id, record.userId));
  }

  return NextResponse.json({ success: true });
}
