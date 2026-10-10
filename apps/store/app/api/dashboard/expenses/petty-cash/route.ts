export const dynamic = "force-dynamic";

import { db } from "@/db";
import { pettyCash, pettyCashTransactions, users } from "@/db/schema";
import { getScope, ownerOnly } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, sql } from "drizzle-orm";

async function activeFund(locationId: string | null) {
  if (locationId) {
    const [scoped] = await db
      .select()
      .from(pettyCash)
      .where(and(eq(pettyCash.status, "active"), eq(pettyCash.locationId, locationId)))
      .orderBy(desc(pettyCash.id))
      .limit(1);
    if (scoped) return scoped;
  }
  const [any] = await db
    .select()
    .from(pettyCash)
    .where(eq(pettyCash.status, "active"))
    .orderBy(desc(pettyCash.id))
    .limit(1);
  return any ?? null;
}

/** GET — the active fund plus its recent transaction ledger. */
export async function GET(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fund = await activeFund(scope.storeLocation);
  if (!fund) {
    return NextResponse.json({ fund: null, transactions: [] });
  }

  const transactions = await db
    .select({
      id: pettyCashTransactions.id,
      type: pettyCashTransactions.type,
      amount: pettyCashTransactions.amount,
      balanceAfter: pettyCashTransactions.balanceAfter,
      description: pettyCashTransactions.description,
      expenseId: pettyCashTransactions.expenseId,
      referenceNumber: pettyCashTransactions.referenceNumber,
      createdAt: pettyCashTransactions.createdAt,
      createdByName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
    })
    .from(pettyCashTransactions)
    .leftJoin(users, eq(pettyCashTransactions.createdBy, users.id))
    .where(eq(pettyCashTransactions.pettyCashId, fund.id))
    .orderBy(desc(pettyCashTransactions.createdAt))
    .limit(50);

  return NextResponse.json({ fund, transactions });
}

/**
 * POST — fund management and manual movements.
 * - create-fund (owner-only): open a fund when none is active
 * - replenish / withdrawal: ledger moves with server-side balance tracking
 * Amounts are poisha.
 */
export async function POST(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const action = body.action as string;
  const amount = Math.round(Number(body.amount));
  const description = (body.description || "").trim();

  if (action === "create-fund") {
    const denied = ownerOnly(scope);
    if (denied) {
      return NextResponse.json({ error: denied.error }, { status: denied.status });
    }
    const existing = await activeFund(scope.storeLocation);
    if (existing) {
      return NextResponse.json(
        { error: "An active petty-cash fund already exists" },
        { status: 409 },
      );
    }
    const [fund] = await db
      .insert(pettyCash)
      .values({
        fundName: (body.fundName || "Petty Cash").trim(),
        locationId: scope.storeLocation ?? body.locationId ?? null,
        custodianId: body.custodianId || scope.userId,
        openingBalance: amount,
        currentBalance: amount,
        lowThreshold: body.lowThreshold ? Math.round(Number(body.lowThreshold)) : 500000,
      })
      .returning();
    if (amount > 0) {
      await db.insert(pettyCashTransactions).values({
        pettyCashId: fund.id,
        type: "replenishment",
        amount,
        balanceAfter: amount,
        description: "Opening balance",
        createdBy: scope.userId,
      });
    }
    return NextResponse.json(fund, { status: 201 });
  }

  if (action !== "replenish" && action !== "withdrawal") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }

  const fund = await activeFund(scope.storeLocation);
  if (!fund) {
    return NextResponse.json({ error: "No active petty-cash fund" }, { status: 404 });
  }

  if (action === "withdrawal" && fund.currentBalance < amount) {
    return NextResponse.json({ error: "Withdrawal exceeds fund balance" }, { status: 400 });
  }

  const balanceAfter =
    action === "replenish" ? fund.currentBalance + amount : fund.currentBalance - amount;

  const result = await db.transaction(async (tx) => {
    await tx
      .update(pettyCash)
      .set({ currentBalance: balanceAfter, updatedAt: new Date() })
      .where(eq(pettyCash.id, fund.id));
    const [txn] = await tx
      .insert(pettyCashTransactions)
      .values({
        pettyCashId: fund.id,
        type: action,
        amount,
        balanceAfter,
        description:
          description || (action === "replenish" ? "Fund replenishment" : "Cash withdrawal"),
        referenceNumber: body.referenceNumber || null,
        createdBy: scope.userId,
      })
      .returning();
    return txn;
  });

  return NextResponse.json(result, { status: 201 });
}
