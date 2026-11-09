export const dynamic = "force-dynamic";

import { db } from "@/db";
import { addresses } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requestUserId } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const userId = requestUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(addresses).where(eq(addresses.userId, userId));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const userId = requestUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const [addr] = await db
    .insert(addresses)
    .values({ ...body, userId, id: body.id || crypto.randomUUID() })
    .returning();

  return NextResponse.json(addr, { status: 201 });
}
