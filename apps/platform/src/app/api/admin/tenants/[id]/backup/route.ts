import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { can } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { backupShopDatabase } from "@/lib/shop-backup";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tenants/[id]/backup — JSON download of the shop database.
 * Billing staff and super admins only; streams as an attachment.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!can(user.role, "tenant:payment")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id));
  if (!t || !t.dbUrlEncrypted) {
    return NextResponse.json({ error: "Shop has no provisioned database" }, { status: 404 });
  }
  try {
    const backup = await backupShopDatabase(t);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(backup, null, 1), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="backup-${t.slug}-${date}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Backup failed" },
      { status: 500 },
    );
  }
}
