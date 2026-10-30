import type { Db } from "./index";
import { plans } from "./schema";
import { PLAN_CATALOG } from "@/lib/plan-catalog";

/**
 * Seeds the initial plan catalog. Insert-if-missing only: the Plans editor is
 * the source of truth once a plan exists, so re-running the seed (every
 * deploy) never reverts prices or feature lists an admin has changed.
 */
export async function seedPlans(db: Db) {
  for (const p of PLAN_CATALOG) {
    await db
      .insert(plans)
      .values({ ...p, features: [...p.features], isActive: true })
      .onConflictDoNothing({ target: plans.id });
  }
}
