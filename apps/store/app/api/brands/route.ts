export const dynamic = "force-dynamic";

import { db } from "@/db";
import { brands } from "@/db/schema";
import { pgErrorCode } from "@/lib/pg-errors";
import { normalizeName } from "@/lib/identifiers";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await db.select().from(brands);
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = r.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return NextResponse.json(unique);
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Duplicate rule: same name ignoring case/whitespace ("NIKE" ≈ "nike").
  // Blocks with a 409 instead of silently returning the existing row so the
  // UI can warn the user — "Brand added" on a no-op hid duplicates before.
  const [existing] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(sql`lower(btrim(${brands.name}))`, normalizeName(name)))
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: `Brand "${name}" already exists` }, { status: 409 });
  }

  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  try {
    const row = await db
      .insert(brands)
      .values({ name, slug, imageUrl: body.imageUrl ?? null })
      .returning();
    return NextResponse.json(row[0], { status: 201 });
  } catch (error) {
    // Backstop: slug collisions hitting brands_slug_unique (Drizzle wraps the code).
    if (pgErrorCode(error) === "23505") {
      return NextResponse.json({ error: `Brand "${name}" already exists` }, { status: 409 });
    }
    throw error;
  }
}
