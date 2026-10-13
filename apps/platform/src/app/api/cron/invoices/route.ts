import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { generateMonthlyInvoices } from "@/lib/invoices";

export const dynamic = "force-dynamic";

/** POST with `Authorization: Bearer $CRON_SECRET`. Schedule daily, after the expire job. */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!safeEqual(token, process.env.CRON_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await generateMonthlyInvoices());
}
