import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { supplierTypes } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const types = await db.query.supplierTypes.findMany({
      orderBy: [desc(supplierTypes.sortOrder), desc(supplierTypes.createdAt)],
    });
    return NextResponse.json(types);
  } catch (error) {
    console.error("Failed to fetch supplier types:", error);
    return NextResponse.json({ error: "Failed to fetch supplier types" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const scope = await getScope(req.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const body = await req.json();
    const { name, slug, description, tone, sortOrder } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
    }

    const existing = await db.query.supplierTypes.findFirst({
      where: eq(supplierTypes.slug, slug),
    });

    if (existing) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    const [newType] = await db
      .insert(supplierTypes)
      .values({
        name,
        slug,
        description: description || null,
        tone: tone || "info",
        sortOrder: sortOrder || 0,
      })
      .returning();

    return NextResponse.json(newType, { status: 201 });
  } catch (error) {
    console.error("Failed to create supplier type:", error);
    return NextResponse.json({ error: "Failed to create supplier type" }, { status: 500 });
  }
}
