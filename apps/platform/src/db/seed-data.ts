import { sql } from "drizzle-orm";
import type { Db } from "./index";
import { plans } from "./schema";
import { PLAN_CATALOG } from "@/lib/plan-catalog";

export async function seedPlans(db: Db) {
  for (const p of PLAN_CATALOG) {
    await db
      .insert(plans)
      .values({ ...p, features: [...p.features], isActive: true })
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          name: sql`excluded.name`,
          monthlyPrice: sql`excluded.monthly_price`,
          signupFee: sql`excluded.signup_fee`,
          maxStaff: sql`excluded.max_staff`,
          maxWarehouses: sql`excluded.max_warehouses`,
          features: sql`excluded.features`,
          sortOrder: sql`excluded.sort_order`,
        },
      });
  }
}
