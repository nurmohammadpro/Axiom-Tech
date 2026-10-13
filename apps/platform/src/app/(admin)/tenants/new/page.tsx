import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { rootDomain, taka } from "@/lib/domain";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { createTenantAction } from "../../actions";
import { Field, Notice } from "../../../ui";

export default async function NewTenantPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const list = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.sortOrder));
  if (!can(user.role, "tenant:create")) return <p className="text-sm">You do not have permission to create shops.</p>;
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Starts a 7-day trial. Activate it once the sign-up fee and first month are paid.</p>
      <Notice error={error} />
      <form action={createTenantAction} className="card space-y-4 p-5">
        <Field label="Shop name"><input name="name" required className="input" /></Field>
        <Field label={`Subdomain (.${rootDomain()})`}><input name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" className="input" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owner name"><input name="ownerName" required className="input" /></Field>
          <Field label="Owner phone"><input name="ownerPhone" className="input" /></Field>
        </div>
        <Field label="Owner email"><input name="ownerEmail" type="email" required className="input" /></Field>
        <Field label="Plan">
          <select name="planId" defaultValue="starter" className="input">
            {list.map((p) => <option key={p.id} value={p.id}>{p.name}: {taka(p.monthlyPrice)}/mo, sign-up {taka(p.signupFee)}</option>)}
          </select>
        </Field>
        <button className="btn btn-primary">Create shop</button>
      </form>
    </div>
  );
}
