export const dynamic = "force-dynamic";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { pgErrorCode } from "@/lib/pg-errors";
import { normalizeName } from "@/lib/identifiers";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(categories).orderBy(categories.name);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const parentId = body.parentId == null || body.parentId === "" ? null : Number(body.parentId);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (parentId !== null && !Number.isInteger(parentId)) {
    return NextResponse.json({ error: "Invalid parent category" }, { status: 400 });
  }

  // Duplicate rule: same name ignoring case/whitespace (" PHONES " ≈ "phones").
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(sql`lower(btrim(${categories.name}))`, normalizeName(name)))
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: `Category "${name}" already exists` }, { status: 409 });
  }

  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  try {
    const row = await db.insert(categories).values({ name, slug, parentId }).returning();
    return NextResponse.json(row[0], { status: 201 });
  } catch (error) {
    // Backstop for exact-slug collisions ("AT&T" vs "ATT") reaching the
    // categories_slug_unique constraint.
    if (pgErrorCode(error) === "23505") {
      return NextResponse.json({ error: `Category "${name}" already exists` }, { status: 409 });
    }
    throw error;
  }
}
