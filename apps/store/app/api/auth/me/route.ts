import { db } from "@/db";
import { staff, users } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requestUserId } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = requestUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      role: users.role,
      loyaltyPoints: users.loyaltyPoints,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Staff members carry a warehouse assignment — the UI uses it to scope
  // inventory, transfers, and POS to their own warehouse.
  const [record] = await db
    .select({
      role: staff.role,
      storeLocation: staff.storeLocation,
      isActive: staff.isActive,
    })
    .from(staff)
    .where(eq(staff.userId, user.id))
    .limit(1);

  return NextResponse.json({
    ...user,
    storeLocation: record?.isActive ? record.storeLocation : null,
    staffRole: record?.isActive ? record.role : null,
    isScoped: Boolean(record?.isActive && record.storeLocation && user.role !== "owner"),
  });
}
