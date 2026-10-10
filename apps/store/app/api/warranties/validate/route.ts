import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryUnits, warranties, warrantyPolicies, users } from "@/db/schema";
import { eq, and, or, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const identifier = searchParams.get("identifier"); // IMEI, serial, or unit code

  if (!identifier) {
    return NextResponse.json({ error: "Identifier required" }, { status: 400 });
  }

  const exact = identifier.replace(/[\s-]/g, "").toUpperCase();

  try {
    // Find the inventory unit by IMEI, serial number, or unit code
    const unit = await db
      .select({
        id: inventoryUnits.id,
        unitCode: inventoryUnits.unitCode,
        imei1: inventoryUnits.imei1,
        imei2: inventoryUnits.imei2,
        serialNumber: inventoryUnits.serialNumber,
        status: inventoryUnits.status,
        warrantyStartAt: inventoryUnits.warrantyStartAt,
        warrantyEndAt: inventoryUnits.warrantyEndAt,
        conditionGrade: inventoryUnits.conditionGrade,
      })
      .from(inventoryUnits)
      .where(
        or(
          eq(inventoryUnits.imei1, identifier),
          eq(inventoryUnits.imei2, identifier),
          eq(inventoryUnits.serialNumber, identifier),
          eq(inventoryUnits.unitCode, identifier),
          sql`UPPER(REPLACE(REPLACE(${inventoryUnits.imei1}, ' ', ''), '-', '')) = ${exact}`,
          sql`UPPER(REPLACE(REPLACE(${inventoryUnits.imei2}, ' ', ''), '-', '')) = ${exact}`,
          sql`UPPER(REPLACE(REPLACE(${inventoryUnits.serialNumber}, ' ', ''), '-', '')) = ${exact}`,
          sql`UPPER(REPLACE(REPLACE(${inventoryUnits.unitCode}, ' ', ''), '-', '')) = ${exact}`,
        ),
      )
      .limit(1);

    if (!unit.length) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const foundUnit = unit[0];
    const now = new Date();
    let warrantyStatus = "unknown";
    let warrantyInfo = null;

    // Check warranty status
    if (foundUnit.warrantyStartAt && foundUnit.warrantyEndAt) {
      if (now < foundUnit.warrantyStartAt) {
        warrantyStatus = "not_started";
      } else if (now > foundUnit.warrantyEndAt) {
        warrantyStatus = "expired";
      } else {
        warrantyStatus = "active";
      }

      warrantyInfo = {
        startsAt: foundUnit.warrantyStartAt,
        endsAt: foundUnit.warrantyEndAt,
        status: warrantyStatus,
        remainingDays: Math.ceil(
          (new Date(foundUnit.warrantyEndAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        ),
      };
    }

    return NextResponse.json({
      unit: {
        id: foundUnit.id,
        unitCode: foundUnit.unitCode,
        status: foundUnit.status,
        conditionGrade: foundUnit.conditionGrade,
      },
      warranty: warrantyInfo,
    });
  } catch (error) {
    console.error("Warranty validation error:", error);
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
