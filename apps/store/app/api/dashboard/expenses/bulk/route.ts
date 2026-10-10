export const dynamic = "force-dynamic";

import { db } from "@/db";
import { expenses, expenseCategories, pettyCash, pettyCashTransactions } from "@/db/schema";
import { getScope } from "@/lib/authz";
import { generateExpenseNumbers } from "@/lib/expense-utils";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";

interface BulkItemInput {
  description: string;
  categoryId?: number | null;
  /** Amount in taka from the form; stored as poisha (×100). */
  amount: number;
  paymentMethod?: string;
  payeeName?: string;
  paymentReference?: string;
  receiptUrl?: string;
  notes?: string;
}

/**
 * Save a batch of expense lines (the New Expense form) as individual
 * `expenses` rows. Owners' entries are pre-approved; staff entries land as
 * `pending` for review. Cash expenses auto-deduct from the active petty-cash
 * fund when it can cover them.
 */
export async function POST(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { expenseDate, notes, paymentStatus = "paid" } = body;
  const items: BulkItemInput[] = Array.isArray(body.items) ? body.items : [];

  const validItems = items.filter((i) => i.description?.trim() && Number(i.amount) > 0);
  if (!validItems.length) {
    return NextResponse.json(
      { error: "At least one expense item with description and amount is required" },
      { status: 400 },
    );
  }

  // Category-driven TDS: categories flag deductibility with a percent rate.
  const categoryIds = validItems
    .map((i) => i.categoryId)
    .filter((id): id is number => typeof id === "number");
  const categories = categoryIds.length
    ? await db.select().from(expenseCategories).where(inArray(expenseCategories.id, categoryIds))
    : [];
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const status = scope.isOwner ? "approved" : "pending";
  const date = expenseDate ? new Date(expenseDate) : new Date();
  const locationId = scope.storeLocation ?? body.locationId ?? null;
  const warnings: string[] = [];

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const numbers = await generateExpenseNumbers(validItems.length, attempt);
      const created = await db.transaction(async (tx) => {
        const rows = [];
        for (let i = 0; i < validItems.length; i++) {
          const item = validItems[i];
          // poisha conversion — the form collects taka
          const amount = Math.round(Number(item.amount) * 100);
          const cat = item.categoryId ? categoryById.get(item.categoryId) : null;
          const tdsAmount =
            cat?.isTaxDeductible && (cat.tdsRate ?? 0) > 0
              ? Math.round((amount * (cat.tdsRate ?? 0)) / 100)
              : 0;
          const totalAmount = amount - tdsAmount;

          const [row] = await tx
            .insert(expenses)
            .values({
              expenseNumber: numbers[i],
              categoryId: item.categoryId ?? null,
              name: item.description.trim(),
              description: item.notes || null,
              amount,
              vatAmount: 0,
              tdsAmount,
              totalAmount,
              expenseDate: date,
              paymentMethod: item.paymentMethod || "cash",
              paymentReference: item.paymentReference || null,
              paymentStatus,
              payeeName: item.payeeName || null,
              status,
              approvedBy: status === "approved" ? scope.userId : null,
              approvedAt: status === "approved" ? new Date() : null,
              locationId,
              receiptUrl: item.receiptUrl || null,
              notes: notes || null,
              createdBy: scope.userId,
            })
            .returning();
          rows.push(row);

          // Cash outlays reduce the petty-cash fund when one can cover them.
          if (paymentStatus === "paid" && (item.paymentMethod || "cash") === "cash") {
            const [fund] = await tx
              .select()
              .from(pettyCash)
              .where(eq(pettyCash.status, "active"))
              .limit(1)
              .for("update");
            if (fund) {
              if (fund.currentBalance >= totalAmount) {
                const balanceAfter = fund.currentBalance - totalAmount;
                await tx
                  .update(pettyCash)
                  .set({ currentBalance: balanceAfter, updatedAt: new Date() })
                  .where(eq(pettyCash.id, fund.id));
                await tx.insert(pettyCashTransactions).values({
                  pettyCashId: fund.id,
                  type: "expense",
                  amount: totalAmount,
                  balanceAfter,
                  description: `${row.expenseNumber} — ${row.name}`,
                  expenseId: row.id,
                  createdBy: scope.userId,
                });
              } else {
                warnings.push(
                  `Petty cash low (৳${(fund.currentBalance / 100).toFixed(0)}) — ${row.name} not deducted`,
                );
              }
            }
          }
        }
        return rows;
      });

      return NextResponse.json(
        { created: created.length, rows: created, warnings },
        { status: 201 },
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "23505") throw err;
      // duplicate expense number (concurrent save) — retry with offset block
    }
  }

  return NextResponse.json(
    { error: "Could not allocate expense numbers — try again" },
    { status: 500 },
  );
}
