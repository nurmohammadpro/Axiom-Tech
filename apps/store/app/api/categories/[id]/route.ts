export const dynamic = "force-dynamic";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { pgErrorCode } from "@/lib/pg-errors";
import { normalizeName } from "@/lib/identifiers";
import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { denyNonStaff } from "@/lib/authz";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyNonStaff(req.headers);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id } = await params;
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const categoryId = Number(id);
  const hasParentId = Object.prototype.hasOwnProperty.call(body, "parentId");
  const parentId = hasParentId
    ? body.parentId == null || body.parentId === ""
      ? null
      : Number(body.parentId)
    : undefined;
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (
    parentId !== undefined &&
    parentId !== null &&
    (!Number.isInteger(parentId) || parentId === categoryId)
  ) {
    return NextResponse.json({ error: "Invalid parent category" }, { status: 400 });
  }

  // Duplicate rule: same name ignoring case/whitespace, excluding the row being renamed.
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(sql`lower(btrim(${categories.name}))`, normalizeName(name)),
        ne(categories.id, Number(id)),
      ),
    )
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: `Category "${name}" already exists` }, { status: 409 });
  }

  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  try {
    const row = await db
      .update(categories)
      .set({ name, slug, ...(hasParentId ? { parentId } : {}) })
      .where(eq(categories.id, categoryId))
      .returning();
    if (!row.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row[0]);
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return NextResponse.json({ error: `Category "${name}" already exists` }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyNonStaff(req.headers);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id } = await params;
  const categoryId = Number(id);
  const [children] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, categoryId))
    .limit(1);
  if (children) return NextResponse.json({ error: "Move child categories before deleting this category" }, { status: 409 });
  const row = await db
    .delete(categories)
    .where(eq(categories.id, categoryId))
    .returning();
  if (!row.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
