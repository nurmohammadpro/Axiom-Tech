-- Salary structure: employee code + basic salary + allowance components + PF %.
ALTER TABLE "staff"
  ADD COLUMN IF NOT EXISTS "employee_code" text,
  ADD COLUMN IF NOT EXISTS "basic_salary" integer,
  ADD COLUMN IF NOT EXISTS "housing_allowance" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "transport_allowance" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "medical_allowance" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "other_allowance" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "provident_fund_rate" integer DEFAULT 0;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_employee_code_unique" ON "staff" ("employee_code") WHERE "employee_code" IS NOT NULL;
