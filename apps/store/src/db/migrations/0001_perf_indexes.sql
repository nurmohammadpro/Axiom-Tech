-- Performance and lookup indexes carried over from the legacy migrations (not expressed in schema.ts).
CREATE INDEX IF NOT EXISTS "returns_exchange_order_id_idx" ON "returns" ("exchange_order_id");
--> statement-breakpoint
-- Performance indexes for the dashboard/report read paths (filter + sort +
-- join columns that were previously unindexed).
CREATE INDEX IF NOT EXISTS "sales_created_at_idx" ON "sales" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_store_id_idx" ON "sales" ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_status_idx" ON "sales" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_customer_phone_idx" ON "sales" ("customer_phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_store_created_idx" ON "sales" ("store_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_lines_sale_id_idx" ON "sale_lines" ("sale_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_lines_variant_id_idx" ON "sale_lines" ("variant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_payments_sale_id_idx" ON "sale_payments" ("sale_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_units_variant_id_idx" ON "inventory_units" ("variant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_units_status_idx" ON "inventory_units" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_units_status_variant_idx" ON "inventory_units" ("status", "variant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_units_received_at_idx" ON "inventory_units" ("received_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_variants_product_id_idx" ON "product_variants" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "returns_sale_line_id_idx" ON "returns" ("sale_line_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "returns_created_at_idx" ON "returns" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exchange_orders_created_at_idx" ON "exchange_orders" ("created_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_employee_code_unique" ON "staff" ("employee_code") WHERE "employee_code" IS NOT NULL;
