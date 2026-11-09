export const dynamic = "force-dynamic";

import { db } from "@/db";
import { expenseCategories } from "@/db/schema";
import { getScope } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";

export async function GET(_req: NextRequest) {
  const rows = await db
    .select()
    .from(expenseCategories)
    .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (scope.isScoped) {
    return NextResponse.json({ error: "Only the store owner can manage categories" }, { status: 403 });
  }

  const body = await req.json();
  const { name, code, icon, color, isTaxDeductible, tdsRate, vatApplicable, parentId, sortOrder } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  const [row] = await db
    .insert(expenseCategories)
    .values({
      name: name.trim(),
      code: code || name.trim().toLowerCase().replace(/\s+/g, "_"),
      icon: icon || null,
      color: color || null,
      isTaxDeductible: isTaxDeductible ?? false,
      tdsRate: tdsRate ? Number(tdsRate) : null,
      vatApplicable: vatApplicable ?? false,
      parentId: parentId ? Number(parentId) : null,
      sortOrder: sortOrder ? Number(sortOrder) : null,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
