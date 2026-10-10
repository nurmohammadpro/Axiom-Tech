import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { pgErrorCode } from "@/lib/pg-errors";
import { normalizeName } from "@/lib/identifiers";
import { NextRequest, NextResponse } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      parentId: categories.parentId,
      productCount: count(products.id),
    })
    .from(categories)
    .leftJoin(products, eq(categories.id, products.categoryId))
    .groupBy(categories.id)
    .orderBy(categories.name);

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

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
    const [cat] = await db.insert(categories).values({ name, slug }).returning();
    return NextResponse.json(cat, { status: 201 });
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return NextResponse.json({ error: `Category "${name}" already exists` }, { status: 409 });
    }
    throw error;
  }
}
