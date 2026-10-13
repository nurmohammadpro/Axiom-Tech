import { checkWarehouseSlot } from "@/lib/plan-limits";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, txDb } from "@/db";
import { getScope } from "@/lib/authz";
import { inventory, inventoryBalances, inventoryUnits, locations } from "@/db/schema";

export const dynamic = "force-dynamic";

function slugCode(name: string, code?: string) {
  const derived = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return (code || `WH-${derived}`).trim().toUpperCase();
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await getScope(request.headers);
  if (scope.isScoped) {
    return NextResponse.json(
      { error: "Only the store owner can manage warehouses" },
      { status: 403 },
    );
  }
  const { id } = await ctx.params;
  const locationId = Number(id);
  if (!Number.isInteger(locationId)) {
    return NextResponse.json({ error: "Invalid location id" }, { status: 400 });
  }

  const [existing] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.isActive === true && !existing.isActive) {
    const slotDenied = await checkWarehouseSlot();
    if (slotDenied) return slotDenied;
  }
  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  if (!name) {
    return NextResponse.json({ error: "Location name cannot be empty" }, { status: 400 });
  }
  const code = slugCode(name, body.code ?? existing.code);

  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(locations)
    .where(ne(locations.id, locationId));

  try {
    const result = await txDb.transaction(async (tx) => {
      if (body.isDefault === true) {
        // Exactly one default: clear the flag on every other location.
        await tx.update(locations).set({ isDefault: false }).where(ne(locations.id, locationId));
      } else if (body.isDefault === false && existing.isDefault && count.n === 0) {
        throw new Error("The only location cannot be unset as default");
      }

      const [updated] = await tx
        .update(locations)
        .set({
          name,
          code,
          address: body.address !== undefined ? String(body.address) : existing.address,
          phone: body.phone !== undefined ? String(body.phone) : existing.phone,
          isDefault:
            body.isDefault === true ? true : body.isDefault === false ? false : existing.isDefault,
          isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
          updatedAt: new Date(),
        })
        .where(eq(locations.id, locationId))
        .returning();
      return updated;
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const conflict = /duplicate key value violates unique constraint/i.test(message);
    return NextResponse.json(
      { error: conflict ? "A location with that name or code already exists" : message },
      { status: conflict ? 409 : 400 },
    );
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await getScope(request.headers);
  if (scope.isScoped) {
    return NextResponse.json(
      { error: "Only the store owner can manage warehouses" },
      { status: 403 },
    );
  }
  const { id } = await ctx.params;
  const locationId = Number(id);
  if (!Number.isInteger(locationId)) {
    return NextResponse.json({ error: "Invalid location id" }, { status: 400 });
  }

  const [loc] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!loc) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  if (loc.isDefault) {
    return NextResponse.json(
      { error: "Cannot delete the default location — set another location as default first" },
      { status: 409 },
    );
  }

  // Guard against deleting a location that still holds stock.
  const [units] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryUnits)
    .where(and(eq(inventoryUnits.locationId, loc.name)));
  const [balances] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryBalances)
    .where(eq(inventoryBalances.locationId, loc.name));
  const [legacy] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventory)
    .where(eq(inventory.location, loc.name));

  const stockUnits = units.count + balances.count + legacy.count;
  if (stockUnits > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete "${loc.name}" — it still holds stock. Move or remove its inventory first.`,
        stockUnits,
      },
      { status: 409 },
    );
  }

  await db.delete(locations).where(eq(locations.id, locationId));
  return NextResponse.json({ deleted: true });
}
