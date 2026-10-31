import { beforeEach, describe, expect, test } from "bun:test";
import { eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { plans, tenants } from "@/db/schema";
import { seedPlans } from "@/db/seed-data";
import { createPlan, deletePlan } from "@/lib/plans-admin";
import { createTenant } from "@/lib/tenants";
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

describe("plan management", () => {
  test("create, block delete while in use, delete when free", async () => {
    await createPlan({
      name: "Enterprise", monthlyPrice: "5000", signupFee: "20000",
      maxStaff: "", maxWarehouses: "", sortOrder: "9",
      features: ["pos", "inventory", "payroll"],
    });
    const rows = await db.select().from(plans).where(eq(plans.id, "enterprise"));
    expect(rows.length).toBe(1);
    expect(rows[0].features.sort()).toEqual(["inventory", "payroll", "pos"]);
    expect(rows[0].maxStaff).toBeNull();
    expect(rows[0].sortOrder).toBe(9);

    // duplicate name -> same id -> blocked
    await expect(createPlan({ name: "enterprise", monthlyPrice: "1", signupFee: "1", maxStaff: "", maxWarehouses: "", sortOrder: "", features: ["pos"] }))
      .rejects.toThrow("already exists");

    // a shop on the plan blocks deletion
    const t = await createTenant({ slug: "ent1", name: "Ent", ownerName: "O", ownerEmail: "o@ent.com", planId: "enterprise" }, null);
    await expect(deletePlan("enterprise")).rejects.toThrow("1 shop is on this plan");

    // move the shop off, then delete works and the plan disappears from lists
    await db.update(tenants).set({ planId: "starter" }).where(eq(tenants.id, t.id));
    await deletePlan("enterprise");
    const visible = await db.select().from(plans).where(isNull(plans.deletedAt));
    expect(visible.find((p) => p.id === "enterprise")).toBeUndefined();
    // row survives (tenants history + seed guard)
    expect((await db.select().from(plans).where(eq(plans.id, "enterprise"))).length).toBe(1);
  });

  test("creating a plan when one exists with the same id but deleted is still blocked (row kept)", async () => {
    await expect(createPlan({ name: "Starter", monthlyPrice: "1", signupFee: "1", maxStaff: "", maxWarehouses: "", sortOrder: "", features: ["pos"] }))
      .rejects.toThrow("already exists");
  });

  test("getPlan through tenants ignores deleted plans", async () => {
    await createPlan({ name: "Temp Plan", monthlyPrice: "500", signupFee: "0", maxStaff: "", maxWarehouses: "", sortOrder: "", features: ["pos"] });
    await db.update(plans).set({ deletedAt: new Date() }).where(eq(plans.id, "temp-plan"));
    await expect(createTenant({ slug: "tempt", name: "T", ownerName: "O", ownerEmail: "o@tempt.com", planId: "temp-plan" }, null))
      .rejects.toThrow("Unknown or inactive plan");
  });
});
