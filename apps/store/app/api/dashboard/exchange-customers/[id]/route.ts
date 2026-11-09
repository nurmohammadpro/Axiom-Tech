import { db } from "@/db";
import { customers } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { id } = await params;
  const body = await request.json();
  const {
    name,
    phone,
    email,
    address,
    city,
    notes,
    nidNumber,
    dob,
    nidImages,
    verificationStatus,
    verificationNotes,
    isActive,
  } = body;

  try {
    const [customer] = await db
      .update(customers)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(phone !== undefined && { phone: phone.trim() }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(city !== undefined && { city: city?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(nidNumber !== undefined && { nidNumber: nidNumber ? Number(nidNumber) : null }),
        ...(dob !== undefined && { dob: dob || null }),
        ...(nidImages !== undefined && { nidImages: Array.isArray(nidImages) ? nidImages : [] }),
        ...(verificationStatus !== undefined && { verificationStatus }),
        ...(verificationNotes !== undefined && {
          verificationNotes: verificationNotes?.trim() || null,
        }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning();

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json(customer);
  } catch (error: any) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A customer with this phone number already exists" },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { id } = await params;

  const [customer] = await db
    .update(customers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
