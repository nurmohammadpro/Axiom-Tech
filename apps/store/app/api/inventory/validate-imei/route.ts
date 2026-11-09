import { NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { inventoryUnits } from "@/db/schema";
import { luhnValid, normalizeImei } from "@/lib/imei";
import { denyNonStaff } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await denyNonStaff(request.headers);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const body = await request.json().catch(() => ({}));
  const imei = normalizeImei(typeof body.imei === "string" ? body.imei : "");

  if (!imei) {
    return NextResponse.json({ error: "IMEI is required" }, { status: 400 });
  }
  if (imei.length !== 15 || !luhnValid(imei)) {
    return NextResponse.json(
      { valid: false, error: "Invalid IMEI (must be a 15-digit Luhn-valid number)" },
      { status: 200 },
    );
  }

  const [existing] = await db
    .select({ id: inventoryUnits.id, status: inventoryUnits.status })
    .from(inventoryUnits)
    .where(or(eq(inventoryUnits.imei1, imei), eq(inventoryUnits.imei2, imei)))
    .limit(1);

  return NextResponse.json({
    valid: true,
    unique: !existing,
    unit: existing ?? null,
  });
}
