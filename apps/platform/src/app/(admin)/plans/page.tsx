import { asc } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
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
      <h1 className="text-xl font-bold">Plans</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>Prices in BDT. Leave a limit empty for unlimited. Feature lists come from the plan catalog and apply to the store app through the gate.</p>
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
            <details className="text-xs" style={{ color: "var(--muted)" }}>
              <summary className="cursor-pointer font-semibold">{p.features.length} features</summary>
              <p className="mt-1 leading-relaxed">{p.features.join(", ")}</p>
            </details>
            {editable && <button className="btn btn-primary w-full">Save {p.name}</button>}
          </form>
        ))}
      </div>
    </div>
  );
}
