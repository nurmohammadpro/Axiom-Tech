export const dynamic = "force-dynamic";

import { db } from "@/db";
import { specTemplates } from "@/db/schema";
import { asc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await db
    .select()
    .from(specTemplates)
    .orderBy(asc(specTemplates.sortOrder), asc(specTemplates.id));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const label = String(body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });

  const [next] = await db
    .select({ max: sql<number | null>`max(${specTemplates.sortOrder})` })
    .from(specTemplates);
  const sortOrder = (next?.max ?? -1) + 1;

  const [row] = await db.insert(specTemplates).values({ label, sortOrder }).returning();
  return NextResponse.json(row, { status: 201 });
}
