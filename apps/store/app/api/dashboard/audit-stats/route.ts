import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, sql, gte, lte, like, or } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const entityType = searchParams.get("entityType");
  const user = searchParams.get("user");
  const fromDate = searchParams.get("from");
  const toDate = searchParams.get("to");
  const search = searchParams.get("search");

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

  if (fromDate) {
    const d = new Date(fromDate);
    if (!isNaN(d.getTime())) conditions.push(gte(auditLog.createdAt, d));
  }

  if (toDate) {
    const d = new Date(toDate);
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

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(where);

  const totalEntries = totalResult[0]?.count || 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayRangeConditions = [gte(auditLog.createdAt, today), lte(auditLog.createdAt, tomorrow), ...(where ? [where] : [])];
  const todayResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(...todayRangeConditions));

  const entriesToday = todayResult[0]?.count || 0;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const yesterdayRangeConditions = [gte(auditLog.createdAt, yesterday), lte(auditLog.createdAt, today), ...(where ? [where] : [])];
  const yesterdayResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(...yesterdayRangeConditions));

  const entriesYesterday = yesterdayResult[0]?.count || 0;
  const entriesTodayChange = entriesYesterday > 0 ? Math.round(((entriesToday - entriesYesterday) / entriesYesterday) * 100) : 0;

  const topUserResult = await db
    .select({ email: users.email, count: sql<number>`count(*)` })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(where)
    .groupBy(users.email)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const topUser = topUserResult[0] || null;

  const mostCommonActionResult = await db
    .select({ action: auditLog.action, count: sql<number>`count(*)` })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(where)
    .groupBy(auditLog.action)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const mostCommonAction = mostCommonActionResult[0]?.action || null;

  const actionDistributionResult = await db
    .select({ action: auditLog.action, count: sql<number>`count(*)` })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(where)
    .groupBy(auditLog.action)
    .orderBy(desc(sql`count(*)`));

  const actionDistribution = actionDistributionResult.map((item) => ({
    action: item.action,
    count: item.count,
    percentage: totalEntries > 0 ? Math.round((item.count / totalEntries) * 100) : 0,
  }));

  const userActivityResult = await db
    .select({ user: users.email, count: sql<number>`count(*)` })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(where)
    .groupBy(users.email)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const userActivity = userActivityResult.map((item) => ({
    user: item.user || "System",
    count: item.count,
  }));

  return NextResponse.json({
    totalEntries,
    entriesToday,
    entriesTodayChange,
    topUser: topUser ? { email: topUser.email || "System", count: topUser.count } : null,
    mostCommonAction,
    actionDistribution,
    userActivity,
  });
}
