export const dynamic = "force-dynamic";

import { db } from "@/db";
import { addresses } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requestUserId } from "@/lib/authz";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = requestUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const [addr] = await db.update(addresses).set(body).where(eq(addresses.id, id)).returning();

  if (!addr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(addr);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = requestUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.delete(addresses).where(eq(addresses.id, id));
  return NextResponse.json({ success: true });
}
