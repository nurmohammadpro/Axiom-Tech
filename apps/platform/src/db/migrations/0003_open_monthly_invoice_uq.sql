CREATE UNIQUE INDEX IF NOT EXISTS "invoices_open_monthly_uq" ON "invoices" ("tenant_id") WHERE kind = 'monthly' and status = 'due';
