export const dynamic = "force-dynamic";

import { db } from "@/db";
import { brands } from "@/db/schema";
import { pgErrorCode } from "@/lib/pg-errors";
import { normalizeName } from "@/lib/identifiers";
import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Duplicate rule: same name ignoring case/whitespace, excluding the row being renamed
  // (renaming "Nike" to "NIKE" must not collide with itself).
  const [existing] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(
      and(eq(sql`lower(btrim(${brands.name}))`, normalizeName(name)), ne(brands.id, Number(id))),
    )
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
      .update(brands)
      .set({ name, slug, imageUrl: body.imageUrl ?? null })
      .where(eq(brands.id, Number(id)))
      .returning();
    if (!row.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row[0]);
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return NextResponse.json({ error: `Brand "${name}" already exists` }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await db
    .delete(brands)
    .where(eq(brands.id, Number(id)))
    .returning();
  if (!row.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
