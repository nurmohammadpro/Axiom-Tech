export const dynamic = "force-dynamic";

import { db } from "@/db";
import { orders, orderItems, users } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { generateVerificationNumber } from "@/lib/identifiers";
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      customerEmail,
      customerPhone,
      items,
      shippingAddress,
      paymentMethod = "card",
      paymentIntentId,
      notes = "",
    } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Calculate totals
    const subtotal = items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
    const shipping = subtotal > 50 ? 0 : 9;
    const tax = 0; // No tax for online orders in Bangladesh
    const total = subtotal + shipping + tax;

    // Generate order ID
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create order - only include userId if it's provided (registered users)
    const orderData: any = {
      id: orderId,
      verificationNumber: generateVerificationNumber(),
      status: "pending",
      subtotal,
      shipping,
      tax,
      total,
      shippingAddress,
      paymentMethod,
      paymentIntentId,
      notes,
    };

    // Only add userId if it's a valid UUID (registered user)
    if (userId && userId !== "guest") {
      orderData.userId = userId;
    }

    // Add customer contact info for guest orders
    if (customerEmail) {
      orderData.customerEmail = customerEmail;
    }
    if (customerPhone) {
      orderData.customerPhone = customerPhone;
    }

    const [order] = await db.insert(orders).values(orderData).returning();

    // Create order items
    const orderItemsData = items.map((item: any) => ({
      orderId,
      productId: item.id,
      name: item.name,
      price: item.price,
      qty: item.quantity,
    }));

    await db.insert(orderItems).values(orderItemsData);

    return NextResponse.json({
      orderId,
      total,
      message: "Order created successfully",
    });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create order" },
      { status: 500 },
    );
  }
}
