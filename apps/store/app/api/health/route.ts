import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness only: touches no database and no platform call. */
export function GET() {
  return NextResponse.json({ ok: true });
}
