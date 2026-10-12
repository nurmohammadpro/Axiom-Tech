import { db } from "@/db";
import { expenses, expenseCategories } from "@/db/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import type { ExpenseCategory } from "./expense-utils";

// ---------------------------------------------------------------------------
// Expense Number Generation
// ---------------------------------------------------------------------------

/**
 * Generate expense number in format: EXP-YYMMDD-NNNN
 * Uses a sequence within the day to ensure uniqueness.
 * `attempt` offsets the sequence on unique-violation retries (concurrent saves).
 */
export async function generateExpenseNumber(attempt = 0): Promise<string> {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const datePart = `${yy}${mm}${dd}`;
  const prefix = `EXP-${datePart}-`;

  // Count existing expenses for today to determine sequence
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(and(gte(expenses.createdAt, startOfDay), lte(expenses.createdAt, endOfDay)));

  const sequence = (result?.count ?? 0) + 1 + attempt;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

/**
 * Bulk variant: the next `n` sequential expense numbers for today.
 * `attempt` offsets the whole block when a unique violation forces a retry.
 */
export async function generateExpenseNumbers(n: number, attempt = 0): Promise<string[]> {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `EXP-${yy}${mm}${dd}-`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(and(gte(expenses.createdAt, startOfDay), lte(expenses.createdAt, endOfDay)));

  const start = (result?.count ?? 0) + 1 + attempt;
  return Array.from({ length: n }, (_, i) => `${prefix}${String(start + i).padStart(4, "0")}`);
}

/**
 * Generate daily expense number in format: DEXP-YYMMDD-NNNN
 */
export async function generateDailyExpenseNumber(): Promise<string> {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const datePart = `${yy}${mm}${dd}`;
  const prefix = `DEXP-${datePart}-`;

  // Count existing daily expenses for today
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const { dailyExpenses } = await import("@/db/schema");
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dailyExpenses)
    .where(and(gte(dailyExpenses.createdAt, startOfDay), lte(dailyExpenses.createdAt, endOfDay)));

  const sequence = (result?.count ?? 0) + 1;
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------

/**
 * Get category by code.
 */
export async function getCategoryByCode(code: string): Promise<ExpenseCategory | null> {
  const [category] = await db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.code, code))
    .limit(1);
  return category ?? null;
}

/**
 * Get all active categories.
 */
export async function getActiveCategories(): Promise<ExpenseCategory[]> {
  return db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.isActive, true))
    .orderBy(expenseCategories.sortOrder);
}

