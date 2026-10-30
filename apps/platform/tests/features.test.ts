import { beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { seedPlans } from "@/db/seed-data";
import { ALL_FEATURES, FEATURE_LABELS, effectiveFeatures, sanitizeFeatures } from "@/lib/features";

describe("feature catalog", () => {
  test("every plan feature key has a label and exists in the catalog order", () => {
    for (const key of ALL_FEATURES) {
      expect(FEATURE_LABELS[key]).toBeString();
      expect(FEATURE_LABELS[key]!.length).toBeGreaterThan(0);
    }
  });

  test("sanitizeFeatures dedupes, drops unknowns, and returns catalog order", () => {
    const out = sanitizeFeatures(["payroll", "pos", "bogus", "inventory", "payroll"]);
    expect(out).toEqual(["pos", "inventory", "payroll"]);
    expect(sanitizeFeatures([])).toEqual([]);
  });

  test("effectiveFeatures grants, revokes, and inherits in plan order", () => {
    const plan = ["pos", "inventory", "barcodes"];
    // revoke middle, grant extra
    expect(effectiveFeatures(plan, { barcodes: false, payroll: true })).toEqual(["pos", "inventory", "payroll"]);
    // inherit untouched
    expect(effectiveFeatures(plan, {})).toEqual(plan);
    expect(effectiveFeatures(plan, null)).toEqual(plan);
  });
});

describe("plan seeding", () => {
  test("re-seeding never reverts admin-edited plans (editor is the source of truth)", async () => {
    const [p] = await db.select().from(plans).where(eq(plans.id, "starter"));
    // Admin edits: different price and an added feature.
    await db
      .update(plans)
      .set({ monthlyPrice: 1234, features: sanitizeFeatures([...p.features, "payroll"]) })
      .where(eq(plans.id, "starter"));

    await seedPlans(db); // e.g. a redeploy runs the seed

    const [after] = await db.select().from(plans).where(eq(plans.id, "starter"));
    expect(after.monthlyPrice).toBe(1234);
    expect(after.features).toContain("payroll");

    // Cleanup: restore for other tests in this file.
    await db.update(plans).set({ monthlyPrice: 1000, features: [...p.features] }).where(eq(plans.id, "starter"));
  });

  test("seeding a fresh table inserts the full catalog", async () => {
    await db.execute(sql`truncate table plans cascade`);
    await seedPlans(db);
    const rows = await db.select().from(plans);
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.features.length).toBeGreaterThan(0);
      expect(r.features.every((f) => ALL_FEATURES.includes(f))).toBe(true);
    }
  });
});
