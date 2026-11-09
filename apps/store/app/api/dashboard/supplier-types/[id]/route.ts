import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { supplierTypes, suppliers } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getScope(req.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await req.json();
    const { name, slug, description, tone, sortOrder, isActive } = body;

    const existing = await db.query.supplierTypes.findFirst({
      where: eq(supplierTypes.id, id),
    });

    if (!existing) {
      return NextResponse.json({ error: "Supplier type not found" }, { status: 404 });
    }

    if (slug && slug !== existing.slug) {
      const slugExists = await db.query.supplierTypes.findFirst({
        where: eq(supplierTypes.slug, slug),
      });

      if (slugExists) {
        return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
      }
    }

    const [updated] = await db
      .update(supplierTypes)
      .set({
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(tone && { tone }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(supplierTypes.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update supplier type:", error);
    return NextResponse.json({ error: "Failed to update supplier type" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getScope(req.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await db.query.supplierTypes.findFirst({
      where: eq(supplierTypes.id, id),
    });

    if (!existing) {
      return NextResponse.json({ error: "Supplier type not found" }, { status: 404 });
    }

    const [supplierCount] = await db
      .select({ count: count() })
      .from(suppliers)
      .where(eq(suppliers.type, existing.slug));

    if (supplierCount.count > 0) {
      return NextResponse.json(
        { 
          error: "Cannot delete supplier type",
          message: `${supplierCount.count} supplier(s) are using this type. Please reassign them first.`
        },
        { status: 409 }
      );
    }

    await db.delete(supplierTypes).where(eq(supplierTypes.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete supplier type:", error);
    return NextResponse.json({ error: "Failed to delete supplier type" }, { status: 500 });
  }
}
