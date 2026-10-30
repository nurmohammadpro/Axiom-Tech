import { asc } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { ALL_FEATURES, FEATURE_LABELS } from "@/lib/features";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { updatePlanAction } from "../actions";
import { Field, Notice } from "../../ui";

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { ok, error } = await searchParams;
  const list = await db.select().from(plans).orderBy(asc(plans.sortOrder));
  const editable = can(user.role, "plans:edit");
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Prices in BDT. Leave a limit empty for unlimited. Feature toggles set what shops on the plan get; individual shops can still be overridden on their own page. Changes reach shops within about 30 seconds.</p>
      <Notice ok={ok} error={error} />
      <div className="grid gap-4 lg:grid-cols-3">
        {list.map((p) => (
          <form key={p.id} action={updatePlanAction.bind(null, p.id)} className="card space-y-3 p-5">
            <h2 className="text-base font-bold">{p.name}</h2>
            <Field label="Monthly price"><input name="monthlyPrice" defaultValue={p.monthlyPrice} disabled={!editable} className="input" /></Field>
            <Field label="Sign-up fee"><input name="signupFee" defaultValue={p.signupFee} disabled={!editable} className="input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Staff seats"><input name="maxStaff" defaultValue={p.maxStaff ?? ""} placeholder="Unlimited" disabled={!editable} className="input" /></Field>
              <Field label="Warehouses"><input name="maxWarehouses" defaultValue={p.maxWarehouses ?? ""} placeholder="Unlimited" disabled={!editable} className="input" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={p.isActive} disabled={!editable} /> Available for new shops</label>
            {editable ? (
              <details>
                <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
                  Features ({p.features.length})
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-1">
                  {ALL_FEATURES.map((key) => (
                    <label key={key} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name={`f_${key}`} defaultChecked={p.features.includes(key)} className="accent-current" />
                      {FEATURE_LABELS[key] ?? key}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  A plan needs at least one feature. Per-shop overrides on the shop page apply on top of these.
                </p>
              </details>
            ) : (
              <details className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                <summary className="cursor-pointer font-semibold">{p.features.length} features</summary>
                <p className="mt-1 leading-relaxed">{p.features.map((k) => FEATURE_LABELS[k] ?? k).join(", ")}</p>
              </details>
            )}
            {editable && <button className="btn btn-primary w-full">Save {p.name}</button>}
          </form>
        ))}
      </div>
    </div>
  );
}
