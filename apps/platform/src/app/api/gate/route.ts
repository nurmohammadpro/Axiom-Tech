import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { getGate } from "@/lib/gate";

export const dynamic = "force-dynamic";

/** GET /api/gate?host=<shop host>  with header x-gate-secret. Used by shop apps / the proxy. */
export async function GET(req: NextRequest) {
  if (!safeEqual(req.headers.get("x-gate-secret"), process.env.GATE_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const host = req.nextUrl.searchParams.get("host");
  if (!host || host.length > 255) return NextResponse.json({ error: "host is required" }, { status: 400 });
  const result = await getGate(host);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
