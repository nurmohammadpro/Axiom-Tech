export const dynamic = "force-dynamic";

import { db } from "@/db";
import { expenses, recurringExpenseTemplates } from "@/db/schema";
import { getScope } from "@/lib/authz";
import { generateExpenseNumbers } from "@/lib/expense-numbers";
import {
  nextRunDate,
  recurringPeriodKey,
  type RecurringFrequency,
} from "@/lib/expense-utils";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

const DAY = 24 * 60 * 60 * 1000;
const CATCH_UP_DAYS = 31;
const MAX_OCCURRENCES_PER_TEMPLATE = 31;

/**
 * POST — materialize due recurring expenses. Idempotent per occurrence via
 * metadata.periodKey, so it's safe to call on every page load.
 */
export async function POST(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await db
    .select()
    .from(recurringExpenseTemplates)
    .where(
      and(
        eq(recurringExpenseTemplates.isActive, true),
        eq(recurringExpenseTemplates.status, "active"),
      ),
    );

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  let created = 0;
  const details: { template: string; occurrences: string[] }[] = [];

  for (const template of templates) {
    // Existing period keys for this template — skip anything already generated.
    const existing = await db
      .select({ periodKey: expenses.metadata })
      .from(expenses)
      .where(eq(expenses.recurringTemplateId, String(template.id)));
    const seenKeys = new Set(
      existing
        .map((r) => (r.periodKey as { periodKey?: string } | null)?.periodKey)
        .filter(Boolean) as string[],
    );

    const schedule = {
      frequency: template.frequency as RecurringFrequency,
      startDate: template.startDate,
      dayOfMonth: template.dayOfMonth,
      dayOfWeek: template.dayOfWeek,
    };

    // Catch-up window: don't backfill older than 31 days.
    const earliest = new Date(
      Math.max(template.startDate.getTime() - DAY, today.getTime() - CATCH_UP_DAYS * DAY),
    );

    const occurrences: Date[] = [];
    let cursor = earliest;
    for (let i = 0; i < MAX_OCCURRENCES_PER_TEMPLATE; i++) {
      const occ = nextRunDate(schedule, cursor);
      if (!occ || occ.getTime() > today.getTime()) break;
      occurrences.push(occ);
      cursor = occ;
    }

    const due = occurrences.filter((occ) => !seenKeys.has(recurringPeriodKey(template.id, occ)));
    if (!due.length) continue;

    for (const occ of due) {
      // Allocate numbers one at a time — collision retries re-run the loop.
      let saved = false;
      for (let attempt = 0; attempt < 5 && !saved; attempt++) {
        try {
          const [number] = await generateExpenseNumbers(1, attempt);
          const [row] = await db
            .insert(expenses)
            .values({
              expenseNumber: number,
              categoryId: template.categoryId,
              name: template.name,
              description: template.description || null,
              amount: template.amount,
              totalAmount: template.amount,
              expenseDate: occ,
              paymentMethod: template.paymentMethod || "cash",
              payeeName: template.payeeName || null,
              status: template.requireApproval ? "pending" : "approved",
              approvedBy: template.requireApproval ? null : scope.userId,
              approvedAt: template.requireApproval ? null : new Date(),
              paymentStatus: "pending",
              locationId: scope.storeLocation ?? null,
              recurringTemplateId: String(template.id),
              metadata: { periodKey: recurringPeriodKey(template.id, occ) },
              createdBy: scope.userId,
            })
            .returning();
          if (row) saved = true;
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code !== "23505") throw err;
        }
      }
      if (saved) created++;
    }

    details.push({
      template: template.name,
      occurrences: due.map((d) => d.toISOString().slice(0, 10)),
    });
  }

  return NextResponse.json({ created, details });
}
