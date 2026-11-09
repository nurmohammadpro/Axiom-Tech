import { NextResponse } from "next/server";
import { getStoreInfo } from "@/lib/store-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = await getStoreInfo();
  return NextResponse.json({
    storeName: info.name,
    currency: info.currency,
    taxRate: info.taxRate,
    vatInclusive: info.vatInclusive,
  });
}
