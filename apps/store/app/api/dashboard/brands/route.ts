import { db } from "@/db";
import { brands, products } from "@/db/schema";
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
      id: brands.id,
      slug: brands.slug,
      name: brands.name,
      imageUrl: brands.imageUrl,
      productCount: count(products.id),
    })
    .from(brands)
    .leftJoin(products, eq(brands.id, products.brandId))
    .groupBy(brands.id)
    .orderBy(brands.name);

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

  // Duplicate rule: same name ignoring case/whitespace ("NIKE" ≈ "nike").
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
    const [brand] = await db
      .insert(brands)
      .values({ name, slug, imageUrl: body.imageUrl ?? null })
      .returning();
    return NextResponse.json(brand, { status: 201 });
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      return NextResponse.json({ error: `Brand "${name}" already exists` }, { status: 409 });
    }
    throw error;
  }
}
