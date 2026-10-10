-- HR: leave types/requests/balances and monthly payroll runs/items.
CREATE TABLE IF NOT EXISTS "leave_types" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "code" text NOT NULL UNIQUE,
  "color" text DEFAULT '#2563eb',
  "paid" boolean NOT NULL DEFAULT true,
  "annual_allowance_days" integer NOT NULL DEFAULT 0,
  "requires_approval" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staff_id" uuid NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "leave_type_id" integer NOT NULL REFERENCES "leave_types"("id"),
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "days" integer NOT NULL DEFAULT 1,
  "reason" text,
  "status" text NOT NULL DEFAULT 'pending',
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_balances" (
  "id" serial PRIMARY KEY,
  "staff_id" uuid NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE,
  "leave_type_id" integer NOT NULL REFERENCES "leave_types"("id"),
  "year" integer NOT NULL,
  "total_days" integer NOT NULL DEFAULT 0,
  "used_days" integer NOT NULL DEFAULT 0,
  "carried_forward" integer NOT NULL DEFAULT 0,
  CONSTRAINT "leave_balances_staff_type_year_unique" UNIQUE ("staff_id", "leave_type_id", "year")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "notes" text,
  "total_gross" integer NOT NULL DEFAULT 0,
  "total_deductions" integer NOT NULL DEFAULT 0,
  "total_net" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "users"("id"),
  "finalized_at" timestamptz,
  "paid_at" timestamptz,
  "created_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_items" (
  "id" serial PRIMARY KEY,
  "payroll_run_id" uuid NOT NULL REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
  "staff_id" uuid NOT NULL REFERENCES "staff"("id"),
  "base_salary" integer NOT NULL DEFAULT 0,
  "allowances" jsonb DEFAULT '[]'::jsonb,
  "deductions" jsonb DEFAULT '[]'::jsonb,
  "gross_salary" integer NOT NULL DEFAULT 0,
  "total_deductions" integer NOT NULL DEFAULT 0,
  "net_salary" integer NOT NULL DEFAULT 0,
  "notes" text,
  "created_at" timestamptz DEFAULT now()
);
