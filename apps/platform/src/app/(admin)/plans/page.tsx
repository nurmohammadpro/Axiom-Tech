import { asc, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { plans, tenants } from "@/db/schema";
import { ALL_FEATURES, FEATURE_LABELS } from "@/lib/features";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { createPlanAction, deletePlanAction, updatePlanAction } from "../actions";
import { SubmitButton } from "../submit-button";
import { Field, Notice } from "../../ui";

function FeatureCheckboxes({ features }: { features: string[] }) {
  return (
    <div className="grid grid-cols-1 gap-1">
      {ALL_FEATURES.map((key) => (
        <label key={key} className="flex items-center gap-2 text-xs">
          <input type="checkbox" name={`f_${key}`} defaultChecked={features.includes(key)} className="accent-current" />
          {FEATURE_LABELS[key] ?? key}
        </label>
      ))}
    </div>
  );
}

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { ok, error } = await searchParams;
  const editable = can(user.role, "plans:edit");
  const list = await db.select().from(plans).where(isNull(plans.deletedAt)).orderBy(asc(plans.sortOrder));
  const counts = await db
    .select({ planId: tenants.planId, n: sql<number>`count(*)::int` })
    .from(tenants)
    .groupBy(tenants.planId);
  const countFor = (id: string) => counts.find((c) => c.planId === id)?.n ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        Prices in BDT. Leave a limit empty for unlimited. Feature toggles set what shops on the plan get; individual shops can still be
        overridden on their own page. Changes reach shops within about 30 seconds. Plans with shops on them cannot be deleted.
      </p>
      <Notice ok={ok} error={error} />

      {editable && (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-bold">New plan</summary>
          <form action={createPlanAction} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><input name="name" required minLength={2} maxLength={30} className="input" placeholder="e.g. Enterprise" /></Field>
              <Field label="Sort order (empty = last)"><input name="sortOrder" type="number" min={0} className="input" /></Field>
              <Field label="Monthly price"><input name="monthlyPrice" type="number" min={0} required className="input" /></Field>
              <Field label="Sign-up fee"><input name="signupFee" type="number" min={0} required className="input" /></Field>
              <Field label="Staff seats (empty = unlimited)"><input name="maxStaff" type="number" min={0} className="input" /></Field>
              <Field label="Warehouses (empty = unlimited)"><input name="maxWarehouses" type="number" min={0} className="input" /></Field>
            </div>
            <details>
              <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>Features</summary>
              <div className="mt-2">
                <FeatureCheckboxes features={["pos", "inventory", "products", "customers", "reports", "settings", "guide", "staff"]} />
              </div>
            </details>
            <SubmitButton className="btn btn-primary" pendingLabel="Creating…">Create plan</SubmitButton>
          </form>
        </details>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {list.map((p) => {
          const shops = countFor(p.id);
          return (
            <form key={p.id} action={updatePlanAction.bind(null, p.id)} className="card space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-bold">{p.name}</h2>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{shops} shop{shops === 1 ? "" : "s"}</span>
              </div>
              <Field label="Name"><input name="name" defaultValue={p.name} disabled={!editable} required minLength={2} className="input" /></Field>
              <Field label="Monthly price"><input name="monthlyPrice" defaultValue={p.monthlyPrice} disabled={!editable} className="input" /></Field>
              <Field label="Sign-up fee"><input name="signupFee" defaultValue={p.signupFee} disabled={!editable} className="input" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Staff seats"><input name="maxStaff" defaultValue={p.maxStaff ?? ""} placeholder="Unlimited" disabled={!editable} className="input" /></Field>
                <Field label="Warehouses"><input name="maxWarehouses" defaultValue={p.maxWarehouses ?? ""} placeholder="Unlimited" disabled={!editable} className="input" /></Field>
              </div>
              <Field label="Sort order"><input name="sortOrder" defaultValue={p.sortOrder} type="number" min={0} disabled={!editable} className="input" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={p.isActive} disabled={!editable} /> Available for new shops</label>
              {editable ? (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
                    Features ({p.features.length})
                  </summary>
                  <div className="mt-2">
                    <FeatureCheckboxes features={p.features} />
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
              {editable && (
                <div className="flex items-center gap-2">
                  <SubmitButton className="btn btn-primary" pendingLabel="Saving…">Save {p.name}</SubmitButton>
                  {shops === 0 && (
                    <DeletePlanButton action={deletePlanAction.bind(null, p.id)} />
                  )}
                </div>
              )}
            </form>
          );
        })}
      </div>
    </div>
  );
}


function DeletePlanButton({ action }: { action: (fd: FormData) => void }) {
  return (
    <SubmitButton
      className="btn btn-danger"
      formAction={action}
      confirm="Delete this plan? It disappears from the console permanently."
      pendingLabel="Deleting…"
    >
      Delete
    </SubmitButton>
  );
}
