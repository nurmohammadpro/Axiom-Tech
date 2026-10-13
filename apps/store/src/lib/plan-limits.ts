import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { locations, staff } from "@/db/schema";
import { atLimit, currentEntitlements } from "@/lib/tenancy/entitlements";

function limitResponse(kind: "staff" | "warehouses", max: number) {
  const noun = kind === "staff" ? "staff seats" : "warehouses";
  return NextResponse.json(
    { error: `Your plan allows up to ${max} ${noun}. Upgrade your plan to add more.`, code: "plan_limit", limit: kind, max },
    { status: 403 },
  );
}

/** Active staff (owner not counted) must stay below the plan's seat limit before adding/reactivating one. */
export async function checkStaffSeat(): Promise<NextResponse | null> {
  const { maxStaff } = await currentEntitlements();
  if (maxStaff === null) return null;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(staff)
    .where(and(eq(staff.isActive, true), ne(staff.role, "owner")));
  return atLimit(r.n, maxStaff) ? limitResponse("staff", maxStaff) : null;
}

/** Active warehouses must stay below the plan's limit before adding/reactivating one. */
export async function checkWarehouseSlot(): Promise<NextResponse | null> {
  const { maxWarehouses } = await currentEntitlements();
  if (maxWarehouses === null) return null;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(locations)
    .where(eq(locations.isActive, true));
  return atLimit(r.n, maxWarehouses) ? limitResponse("warehouses", maxWarehouses) : null;
}
