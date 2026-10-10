import { db } from "@/db";
import { returns, orders, users, orderItems } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET returns for a specific customer
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: returns.id,
      orderId: returns.orderId,
      productId: returns.productId,
      productName: returns.productName,
      qty: returns.qty,
      reason: returns.reason,
      condition: returns.condition,
      resolutionType: returns.resolutionType,
      status: returns.status,
      refundAmount: returns.refundAmount,
      adminNotes: returns.adminNotes,
      trackingNumber: returns.trackingNumber,
      createdAt: returns.createdAt,
      updatedAt: returns.updatedAt,
      resolvedAt: returns.resolvedAt,
    })
    .from(returns)
    .where(eq(returns.userId, userId))
    .orderBy(desc(returns.createdAt));

  return NextResponse.json(rows);
}

// POST create a new return request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, orderId, productId, productName, qty, reason, condition, resolutionType, userId } =
      body;

    // Get order details for customer info
    const order = await db
      .select({
        userId: orders.userId,
        customerEmail: orders.customerEmail,
        customerPhone: orders.customerPhone,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order || order.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const orderData = order[0];
    let customerEmail = orderData.customerEmail;
    let customerPhone = orderData.customerPhone;
    let customerName = "";

    // If registered user, get their details
    if (orderData.userId) {
      const userData = await db
        .select({
          email: users.email,
          phone: users.phone,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, orderData.userId))
        .limit(1);

      if (userData && userData.length > 0) {
        customerEmail = userData[0].email;
        customerPhone = userData[0].phone;
        customerName = `${userData[0].firstName} ${userData[0].lastName}`;
      }
    }

    // Get order item for price calculation
    const orderItem = await db
      .select({
        id: orderItems.id,
        price: orderItems.price,
      })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.productId, productId)))
      .limit(1);

    let refundAmount = 0;
    if (orderItem && orderItem.length > 0) {
      refundAmount = orderItem[0].price * qty;
    }

    const [ret] = await db
      .insert(returns)
      .values({
        id,
        orderId,
        orderItemId: orderItem?.[0]?.id,
        userId: userId || orderData.userId,
        customerEmail,
        customerPhone,
        customerName,
        productId,
        productName,
        qty,
        reason,
        condition,
        resolutionType,
        status: "pending",
        channel: "online",
        refundAmount,
      })
      .returning();

    return NextResponse.json(ret, { status: 201 });
  } catch (error) {
    console.error("Return creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create return" },
      { status: 500 },
    );
  }
}
