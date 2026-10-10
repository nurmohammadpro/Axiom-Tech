import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, like, or, and, sql, gte, lte } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");
  const action = searchParams.get("action");
  const search = searchParams.get("search");
  const entityType = searchParams.get("entityType");
  const user = searchParams.get("user");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const conditions = [];

  if (action) {
    conditions.push(eq(auditLog.action, action));
  }

  if (entityType) {
    conditions.push(eq(auditLog.entityType, entityType));
  }

  if (user) {
    conditions.push(like(users.email, `%${user}%`));
  }

  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) conditions.push(gte(auditLog.createdAt, d));
  }

  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) conditions.push(lte(auditLog.createdAt, d));
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(auditLog.action, pattern),
        like(auditLog.entityId, pattern),
        like(users.email, pattern),
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      userEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(where);

  return NextResponse.json({ rows, total: count });
}
