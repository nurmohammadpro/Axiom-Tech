export const dynamic = "force-dynamic";

import { db } from "@/db";
import { expenseCategories } from "@/db/schema";
import { getScope } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (scope.isScoped) {
    return NextResponse.json({ error: "Only the store owner can manage categories" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, code, icon, color, isTaxDeductible, tdsRate, vatApplicable, sortOrder } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  const [row] = await db
    .update(expenseCategories)
    .set({
      name: name.trim(),
      code: code || name.trim().toLowerCase().replace(/\s+/g, "_"),
      icon: icon || null,
      color: color || null,
      isTaxDeductible: isTaxDeductible ?? false,
      tdsRate: tdsRate ? Number(tdsRate) : null,
      vatApplicable: vatApplicable ?? false,
      sortOrder: sortOrder ? Number(sortOrder) : null,
    })
    .where(eq(expenseCategories.id, Number(id)))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getScope(_req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (scope.isScoped) {
    return NextResponse.json({ error: "Only the store owner can manage categories" }, { status: 403 });
  }

  const { id } = await params;

  const [row] = await db
    .delete(expenseCategories)
    .where(eq(expenseCategories.id, Number(id)))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
