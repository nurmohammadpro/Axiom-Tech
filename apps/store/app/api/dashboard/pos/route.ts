import { db } from "@/db";
import { cashRegisters, returns, salePayments, sales, users } from "@/db/schema";
import { getScope } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: cashRegisters.id,
      name: cashRegisters.name,
      openingBal: cashRegisters.openingBal,
      closingBal: cashRegisters.closingBal,
      variance: cashRegisters.variance,
      note: cashRegisters.note,
      status: cashRegisters.status,
      openedAt: cashRegisters.openedAt,
      closedAt: cashRegisters.closedAt,
      openedByName: users.firstName,
    })
    .from(cashRegisters)
    .leftJoin(users, eq(cashRegisters.openedBy, users.id))
    .orderBy(desc(cashRegisters.openedAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Whitelist fields — never mass-assign session rows.
  const [reg] = await db
    .insert(cashRegisters)
    .values({
      name: String(body.name ?? "Register").slice(0, 120),
      openingBal: Math.max(0, Math.round(Number(body.openingBal) || 0)),
      openedBy: body.openedBy ?? null,
    })
    .returning();
  return NextResponse.json(reg, { status: 201 });
}

/** Expected cash in drawer: opening balance + POS cash sales − cash refunds since open. */
async function expectedCash(openedAt: Date, openingBal: number): Promise<number> {
  const [cashIn] = await db
    .select({ total: sql<number>`coalesce(sum(${salePayments.amount}), 0)::int` })
    .from(salePayments)
    .innerJoin(sales, eq(salePayments.saleId, sales.id))
    .where(
      and(
        eq(salePayments.status, "confirmed"),
        eq(salePayments.method, "cash"),
        eq(sales.channel, "POS"),
        gte(sales.createdAt, openedAt),
      ),
    );
  const [refunds] = await db
    .select({ total: sql<number>`coalesce(sum(${returns.refundAmount}), 0)::int` })
    .from(returns)
    .where(and(eq(returns.refundMethod, "cash"), gte(returns.refundedAt, openedAt)));
  return openingBal + (cashIn?.total ?? 0) - (refunds?.total ?? 0);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const scope = await getScope(request.headers);
  if (!scope.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [session] = await db.select().from(cashRegisters).where(eq(cashRegisters.id, id)).limit(1);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Partial updates (e.g. renaming) only touch whitelisted fields.
  if (body.status !== "closed") {
    const patch: Partial<typeof cashRegisters.$inferInsert> = {};
    if (body.name !== undefined) patch.name = String(body.name).slice(0, 120);
    if (body.openingBal !== undefined)
      patch.openingBal = Math.max(0, Math.round(Number(body.openingBal) || 0));
    if (Object.keys(patch).length === 0)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    const [updated] = await db
      .update(cashRegisters)
      .set(patch)
      .where(eq(cashRegisters.id, id))
      .returning();
    return NextResponse.json(updated);
  }

  // Closing the session: the counted balance is compared against expected
  // cash computed on the server, so the variance is owner-auditable and not
  // whatever the client reported.
  const closingBal = Math.round(Number(body.closingBal) || 0);
  const openedAt = session.openedAt ?? new Date();
  const expected = await expectedCash(openedAt, session.openingBal);
  const [updated] = await db
    .update(cashRegisters)
    .set({
      status: "closed",
      closingBal,
      variance: closingBal - expected,
      note: body.note ? String(body.note).slice(0, 500) : null,
      closedAt: new Date(),
      closedBy: scope.userId,
    })
    .where(eq(cashRegisters.id, id))
    .returning();
  return NextResponse.json(updated);
}
