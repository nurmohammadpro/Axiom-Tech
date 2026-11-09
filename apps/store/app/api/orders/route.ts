export const dynamic = "force-dynamic";

import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getScope } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  // Staff may list all orders (optionally filtered by ?userId=); customers are
  // always pinned to their own orders regardless of the query param.
  const userId = scope.role === "customer" ? scope.userId : searchParams.get("userId");

  const conditions = [];
  if (userId) conditions.push(eq(orders.userId, userId));

  const rows = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      status: orders.status,
      subtotal: orders.subtotal,
      shipping: orders.shipping,
      tax: orders.tax,
      total: orders.total,
      shippingAddress: orders.shippingAddress,
      paymentMethod: orders.paymentMethod,
      paymentIntentId: orders.paymentIntentId,
      notes: orders.notes,
      customerEmail: orders.customerEmail,
      customerPhone: orders.customerPhone,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      customerFirstName: users.firstName,
      customerLastName: users.lastName,
      userEmail: users.email,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(desc(orders.createdAt));

  return NextResponse.json(rows);
}
