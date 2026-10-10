export const dynamic = "force-dynamic";

import { db } from "@/db";
import { recurringExpenseTemplates } from "@/db/schema";
import { getScope, ownerOnly } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

/** PUT — edit / pause / resume a template. Owner-only. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(req.headers);
  const denied = ownerOnly(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { id } = await params;
  const body = await req.json();

  const [existing] = await db
    .select()
    .from(recurringExpenseTemplates)
    .where(eq(recurringExpenseTemplates.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const updateData: Partial<typeof recurringExpenseTemplates.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.description !== undefined) updateData.description = body.description || null;
  if (body.categoryId !== undefined)
    updateData.categoryId = body.categoryId ? Number(body.categoryId) : null;
  if (body.amount !== undefined) updateData.amount = Math.round(Number(body.amount));
  if (body.frequency !== undefined) updateData.frequency = body.frequency;
  if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate);
  if (body.dayOfMonth !== undefined)
    updateData.dayOfMonth = body.dayOfMonth ? Number(body.dayOfMonth) : null;
  if (body.dayOfWeek !== undefined) updateData.dayOfWeek = body.dayOfWeek || null;
  if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod;
  if (body.payeeName !== undefined) updateData.payeeName = body.payeeName || null;
  if (body.requireApproval !== undefined) updateData.requireApproval = !!body.requireApproval;
  if (body.isActive !== undefined) {
    updateData.isActive = !!body.isActive;
    updateData.status = body.isActive ? "active" : "paused";
  }

  const [updated] = await db
    .update(recurringExpenseTemplates)
    .set(updateData)
    .where(eq(recurringExpenseTemplates.id, id))
    .returning();

  return NextResponse.json(updated);
}

/** DELETE — soft-cancel so generated expenses keep their template link. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(req.headers);
  const denied = ownerOnly(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { id } = await params;
  const [updated] = await db
    .update(recurringExpenseTemplates)
    .set({ isActive: false, status: "cancelled", updatedAt: new Date() })
    .where(eq(recurringExpenseTemplates.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
