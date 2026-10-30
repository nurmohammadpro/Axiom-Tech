export const dynamic = "force-dynamic";

import { db } from "@/db";
import { specTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { denyNonStaff } from "@/lib/authz";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyNonStaff(req.headers);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id } = await params;
  const body = await req.json();
  const label = String(body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });

  const [row] = await db
    .update(specTemplates)
    .set({ label })
    .where(eq(specTemplates.id, Number(id)))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyNonStaff(req.headers);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { id } = await params;
  const [row] = await db
    .delete(specTemplates)
    .where(eq(specTemplates.id, Number(id)))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
