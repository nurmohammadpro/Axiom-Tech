import { db } from "@/db";
import { customers } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, or, like, desc } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(customers.name, `%${search}%`),
        like(customers.phone, `%${search}%`),
        like(customers.email, `%${search}%`),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(customers)
    .where(conditions.length ? or(...conditions) : undefined)
    .orderBy(desc(customers.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await request.json();
  const { name, phone, email, address, city, notes, nidNumber, dob, nidImages } = body;

  if (!name?.trim() || !phone?.trim()) {
    return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
  }

  try {
    const [customer] = await db
      .insert(customers)
      .values({
        name: name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        notes: notes?.trim() || null,
        nidNumber: nidNumber ? Number(nidNumber) : null,
        dob: dob || null,
        nidImages: Array.isArray(nidImages) ? nidImages : [],
        verificationStatus: "unverified",
        isActive: true,
        totalExchanges: 0,
        totalExchangeValue: 0,
      })
      .returning();

    return NextResponse.json(customer, { status: 201 });
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
