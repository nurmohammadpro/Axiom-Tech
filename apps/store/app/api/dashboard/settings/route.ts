import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { DEFAULTS, type StoreInfo } from "@/lib/store-settings";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const rows = await db.select().from(storeSettings);
  const settings: Record<string, any> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  if (settings.store_info && typeof settings.store_info === "object") {
    settings.store_info = { ...DEFAULTS, ...(settings.store_info as Partial<StoreInfo>) };
  }
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await request.json();

  for (const [key, value] of Object.entries(body)) {
    await db
      .insert(storeSettings)
      .values({ key, value: value as any })
      .onConflictDoUpdate({ target: storeSettings.key, set: { value: value as any } });
  }

  return NextResponse.json({ success: true });
}
