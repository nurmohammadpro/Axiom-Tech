export const dynamic = "force-dynamic";

import { db } from "@/db";
import { wishlistItems, products } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { requestUserId } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const userId = requestUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(wishlistItems).where(eq(wishlistItems.userId, userId));

  const productIds = rows.map((r) => r.productId);
  if (productIds.length === 0) return NextResponse.json([]);

  const prods = await db
    .select()
    .from(products)
    .where(productIds.length > 0 ? eq(products.id, productIds[0]) : undefined);

  return NextResponse.json(
    rows.map((w) => ({
      ...w,
      product: prods.find((p) => p.id === w.productId),
    })),
  );
}

export async function POST(request: NextRequest) {
  const userId = requestUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await request.json();
  const [item] = await db
    .insert(wishlistItems)
    .values({ userId, productId })
    .onConflictDoNothing()
    .returning();

  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const userId = requestUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await request.json();
  await db
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)));

  return NextResponse.json({ success: true });
}
