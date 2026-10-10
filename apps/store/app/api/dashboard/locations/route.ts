import { NextRequest, NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { getScope } from "@/lib/authz";
import { inventory, inventoryUnits, locations } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      address: locations.address,
      phone: locations.phone,
      isDefault: locations.isDefault,
      isActive: locations.isActive,
      createdAt: locations.createdAt,
      updatedAt: locations.updatedAt,
    })
    .from(locations)
    .orderBy(asc(locations.isDefault), asc(locations.name));

  // Stock counts per location so the settings screen and pickers can show usage.
  const unitCounts = await db
    .select({
      locationId: inventoryUnits.locationId,
      count: sql<number>`count(*)::int`,
    })
    .from(inventoryUnits)
    .groupBy(inventoryUnits.locationId);
  const skuCounts = await db
    .select({
      locationId: inventory.location,
      count: sql<number>`count(*)::int`,
    })
    .from(inventory)
    .groupBy(inventory.location);

  const unitsByLocation = new Map(unitCounts.map((r) => [r.locationId, r.count]));
  const skusByLocation = new Map(skuCounts.map((r) => [r.locationId, r.count]));

  return NextResponse.json(
    rows.map((l) => ({
      ...l,
      unitCount: unitsByLocation.get(l.name) ?? 0,
      skuCount: skusByLocation.get(l.name) ?? 0,
    })),
  );
}

function slugCode(name: string, code?: string) {
  const derived = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return (code || `WH-${derived}`).trim().toUpperCase();
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  if (scope.isScoped) {
    return NextResponse.json(
      { error: "Only the store owner can manage warehouses" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Location name is required" }, { status: 400 });
  }
  const code = slugCode(name, body.code);

  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(locations);
  const isDefault = count.n === 0; // First location automatically becomes default.

  try {
    const [created] = await db
      .insert(locations)
      .values({
        name,
        code,
        address: body.address ? String(body.address) : null,
        phone: body.phone ? String(body.phone) : null,
        isDefault,
        isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const conflict = /duplicate key value violates unique constraint/i.test(message);
    return NextResponse.json(
      { error: conflict ? "A location with that name or code already exists" : message },
      { status: conflict ? 409 : 400 },
    );
  }
}
