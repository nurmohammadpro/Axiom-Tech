export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { deleteProductById } from "@/lib/product-delete";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireOwner(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await request.json().catch(() => ({}));
  const ids: unknown = body?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No product ids provided" }, { status: 400 });
  }

  const uniqueIds = [...new Set(ids.map((id) => String(id)))];
  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of uniqueIds) {
    const result = await deleteProductById(id);
    if (result.ok) deleted.push(id);
    else failed.push({ id, error: result.error });
  }

  return NextResponse.json({ deleted, failed });
}
