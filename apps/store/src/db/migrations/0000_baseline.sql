CREATE TABLE "addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text DEFAULT 'Home',
	"full_name" text NOT NULL,
	"street" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"country" text DEFAULT 'United States' NOT NULL,
	"phone" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attribute_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"attribute_id" integer NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"data_type" text DEFAULT 'string' NOT NULL,
	"scope" text DEFAULT 'variant' NOT NULL,
	CONSTRAINT "attributes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "barcodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"barcode_type" text NOT NULL,
	"variant_id" integer,
	"inventory_unit_id" uuid,
	"sale_id" uuid,
	"status" text DEFAULT 'active',
	"printed_at" timestamp with time zone,
	"replaced_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "barcodes_value_unique" UNIQUE("value")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"location_id" text,
	"period_type" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"allocated_amount" integer NOT NULL,
	"spent_amount" integer DEFAULT 0,
	"notes" text,
	"created_by" uuid,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "budget_category_period_unique" UNIQUE("category_id","location_id","period_type","period_start")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"discount_pct" integer,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"session_id" text,
	"product_id" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cash_flow_projections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text,
	"projection_month" timestamp with time zone NOT NULL,
	"month_number" integer NOT NULL,
	"projected_income" integer DEFAULT 0,
	"projected_expenses" integer DEFAULT 0,
	"actual_income" integer DEFAULT 0,
	"actual_expenses" integer DEFAULT 0,
	"income_breakdown" jsonb DEFAULT '{}'::jsonb,
	"expense_breakdown" jsonb DEFAULT '{}'::jsonb,
	"opening_balance" integer DEFAULT 0,
	"is_actual" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "cashflow_location_month_unique" UNIQUE("location_id","projection_month")
);
--> statement-breakpoint
CREATE TABLE "cash_registers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"opened_by" uuid,
	"opening_bal" integer DEFAULT 0 NOT NULL,
	"closing_bal" integer,
	"variance" integer,
	"note" text,
	"status" text DEFAULT 'open',
	"opened_at" timestamp with time zone DEFAULT now(),
	"closed_at" timestamp with time zone,
	"closed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"city" text,
	"notes" text,
	"nid_number" bigint,
	"dob" text,
	"nid_images" jsonb DEFAULT '[]'::jsonb,
	"verification_status" text DEFAULT 'unverified',
	"verification_notes" text,
	"is_active" boolean DEFAULT true,
	"total_exchanges" integer DEFAULT 0,
	"total_exchange_value" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "daily_expense_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"daily_expense_id" uuid NOT NULL,
	"head" text NOT NULL,
	"custom_head" text,
	"amount" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_number" text NOT NULL,
	"expense_date" timestamp with time zone DEFAULT now(),
	"total" integer DEFAULT 0 NOT NULL,
	"payment_method" text DEFAULT 'cash',
	"status" text DEFAULT 'paid',
	"notes" text,
	"created_by" uuid,
	"location_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "daily_expenses_expense_number_unique" UNIQUE("expense_number")
);
--> statement-breakpoint
CREATE TABLE "exchange_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"trade_in_product_id" text,
	"trade_in_product_variant_id" integer,
	"trade_in_cost_code" text,
	"trade_in_d_code" text,
	"trade_in_sell_code" text,
	"trade_in_agreed_value" integer NOT NULL,
	"trade_in_cost_price" integer,
	"trade_in_sell_price" integer,
	"trade_in_items" jsonb NOT NULL,
	"new_product_variant_id" integer,
	"new_product_price" integer NOT NULL,
	"new_device_unit" jsonb,
	"new_device_warranty_policy_id" integer,
	"new_device_warranty_snapshot" jsonb,
	"new_device_warranty_starts_at" timestamp with time zone,
	"new_device_warranty_expires_at" timestamp with time zone,
	"invoice_number" text,
	"barcode_value" text,
	"payment_amount" integer NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"payment_reference" text,
	"payments" jsonb,
	"location_id" text,
	"notes" text,
	"status" text DEFAULT 'complete',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exchange_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"month_1_value" integer DEFAULT 70 NOT NULL,
	"month_2_value" integer DEFAULT 60 NOT NULL,
	"month_3_value" integer DEFAULT 50 NOT NULL,
	"month_6_value" integer DEFAULT 40 NOT NULL,
	"month_12_value" integer DEFAULT 30 NOT NULL,
	"excellent_condition_bonus" integer DEFAULT 5,
	"good_condition_bonus" integer DEFAULT 0,
	"fair_condition_penalty" integer DEFAULT -10,
	"poor_condition_penalty" integer DEFAULT -25,
	"exchange_fee" integer DEFAULT 0,
	"min_device_age" integer DEFAULT 1,
	"max_device_age" integer DEFAULT 24,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"status" text DEFAULT 'pending',
	"notes" text,
	"actioned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_type" text,
	"file_size" integer,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"parent_id" integer,
	"description" text,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0,
	"is_tax_deductible" boolean DEFAULT false,
	"tds_rate" integer DEFAULT 0,
	"vat_applicable" boolean DEFAULT false,
	"default_budget_amount" integer,
	"budget_alert_threshold" integer DEFAULT 80,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "expense_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_number" text NOT NULL,
	"category_id" integer,
	"name" text NOT NULL,
	"description" text,
	"amount" integer NOT NULL,
	"vat_amount" integer DEFAULT 0,
	"tds_amount" integer DEFAULT 0,
	"total_amount" integer NOT NULL,
	"currency" text DEFAULT 'BDT',
	"exchange_rate" integer DEFAULT 100,
	"original_amount" integer,
	"original_currency" text,
	"expense_date" timestamp with time zone DEFAULT now(),
	"payment_method" text DEFAULT 'cash',
	"payment_reference" text,
	"payment_status" text DEFAULT 'paid',
	"payee_name" text,
	"payee_type" text,
	"vendor_invoice_number" text,
	"vendor_invoice_date" timestamp with time zone,
	"status" text DEFAULT 'approved',
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"approval_notes" text,
	"is_reimbursable" boolean DEFAULT false,
	"reimbursed_amount" integer DEFAULT 0,
	"reimbursed_to" uuid,
	"reimbursed_at" timestamp with time zone,
	"location_id" text,
	"recurring_template_id" text,
	"budget_category" text,
	"receipt_url" text,
	"invoice_url" text,
	"attachment_urls" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "expenses_expense_number_unique" UNIQUE("expense_number")
);
--> statement-breakpoint
CREATE TABLE "feature_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_key" text NOT NULL,
	"role" text NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid,
	CONSTRAINT "unique_feature_role" UNIQUE("feature_key","role")
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"sku" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 10,
	"location" text,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "inventory_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"location_id" text,
	"available_qty" integer DEFAULT 0 NOT NULL,
	"reserved_qty" integer DEFAULT 0 NOT NULL,
	"damaged_qty" integer DEFAULT 0 NOT NULL,
	"in_transit_qty" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "inventory_balances_variant_id_location_id_unique" UNIQUE("variant_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_number" text NOT NULL,
	"variant_id" integer NOT NULL,
	"location_id" text,
	"purchase_order_id" text,
	"supplier_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "inventory_batches_batch_number_unique" UNIQUE("batch_number")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer,
	"unit_id" uuid,
	"location_id" text,
	"movement_type" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"before_qty" integer,
	"after_qty" integer,
	"source_type" text,
	"source_id" text,
	"reason" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" integer NOT NULL,
	"batch_id" uuid,
	"unit_code" text,
	"barcode" text,
	"identity_type" text DEFAULT 'imei' NOT NULL,
	"imei_1" text,
	"imei_2" text,
	"serial_number" text,
	"condition_grade" text,
	"battery_health" integer,
	"inspection_status" text DEFAULT 'pending',
	"acquisition_cost" integer,
	"current_price" integer,
	"cost_code" text,
	"d_code" text,
	"sell_code" text,
	"color" text,
	"status" text DEFAULT 'received' NOT NULL,
	"warranty_start_at" timestamp with time zone,
	"warranty_end_at" timestamp with time zone,
	"location_id" text,
	"received_at" timestamp with time zone DEFAULT now(),
	"sold_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "inventory_units_imei_1_unique" UNIQUE("imei_1"),
	CONSTRAINT "inventory_units_serial_number_unique" UNIQUE("serial_number"),
	CONSTRAINT "inventory_units_unit_code_unique" UNIQUE("unit_code"),
	CONSTRAINT "inventory_units_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"leave_type_id" integer NOT NULL,
	"year" integer NOT NULL,
	"total_days" integer DEFAULT 0 NOT NULL,
	"used_days" integer DEFAULT 0 NOT NULL,
	"carried_forward" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "leave_balances_staff_id_leave_type_id_year_unique" UNIQUE("staff_id","leave_type_id","year")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"leave_type_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days" integer DEFAULT 1 NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"color" text DEFAULT '#2563eb',
	"paid" boolean DEFAULT true NOT NULL,
	"annual_allowance_days" integer DEFAULT 0 NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "leave_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"phone" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "locations_name_unique" UNIQUE("name"),
	CONSTRAINT "locations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"qty" integer NOT NULL,
	"imei_snapshot" jsonb,
	"warranty_policy_id" integer,
	"warranty_snapshot" jsonb,
	"warranty_starts_at" timestamp with time zone,
	"warranty_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"subtotal" integer NOT NULL,
	"shipping" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"payment_method" text NOT NULL,
	"payment_intent_id" text,
	"notes" text,
	"customer_email" text,
	"customer_phone" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"base_salary" integer DEFAULT 0 NOT NULL,
	"allowances" jsonb DEFAULT '[]'::jsonb,
	"deductions" jsonb DEFAULT '[]'::jsonb,
	"gross_salary" integer DEFAULT 0 NOT NULL,
	"total_deductions" integer DEFAULT 0 NOT NULL,
	"net_salary" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"total_gross" integer DEFAULT 0 NOT NULL,
	"total_deductions" integer DEFAULT 0 NOT NULL,
	"total_net" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"finalized_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "petty_cash" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_name" text DEFAULT 'Petty Cash' NOT NULL,
	"location_id" text,
	"custodian_id" uuid,
	"opening_balance" integer DEFAULT 0 NOT NULL,
	"current_balance" integer DEFAULT 0 NOT NULL,
	"low_threshold" integer DEFAULT 500000,
	"status" text DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "petty_cash_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"petty_cash_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"description" text NOT NULL,
	"expense_id" uuid,
	"reference_number" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" integer,
	"storage_key" text NOT NULL,
	"alt_text" text,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "product_specs" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "product_specs_product_id_label_unique" UNIQUE("product_id","label")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"attribute" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sku" text NOT NULL,
	"cost_price" integer,
	"selling_price" integer NOT NULL,
	"cost_code" text,
	"d_code" text,
	"sell_code" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"barcode" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "product_variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand_id" integer,
	"category_id" integer,
	"category" text DEFAULT 'pre-owned' NOT NULL,
	"price" integer NOT NULL,
	"original_price" integer,
	"cost_price" integer,
	"cost_code" text,
	"d_code" text,
	"sell_code" text,
	"short" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"bg_color" text DEFAULT '#f2f2f4',
	"text_color" text DEFAULT '#1d1d1f',
	"product_type" text DEFAULT 'new' NOT NULL,
	"track_units" boolean DEFAULT false NOT NULL,
	"publish_status" text DEFAULT 'draft' NOT NULL,
	"warranty_policy_id" integer,
	"in_stock" boolean DEFAULT true,
	"images" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" integer,
	"qty_ordered" integer NOT NULL,
	"qty_received" integer DEFAULT 0,
	"cost_code" text,
	"d_code" text,
	"sell_code" text,
	"cost_price" integer DEFAULT 0 NOT NULL,
	"sell_price" integer DEFAULT 0 NOT NULL,
	"category" text DEFAULT 'pre-owned',
	"brand_id" integer,
	"battery_health" integer,
	"condition_grade" text,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier" text NOT NULL,
	"supplier_id" uuid,
	"status" text DEFAULT 'pending',
	"total" integer NOT NULL,
	"location_id" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"received_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recurring_expense_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" integer,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'BDT',
	"frequency" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"day_of_month" integer,
	"day_of_week" text,
	"payment_method" text,
	"payee_name" text,
	"escalation_type" text DEFAULT 'none',
	"escalation_rate" integer DEFAULT 0,
	"require_approval" boolean DEFAULT true,
	"approval_limit" integer DEFAULT 0,
	"assigned_to" uuid,
	"cost_center" text,
	"alert_days_before" integer DEFAULT 3,
	"is_active" boolean DEFAULT true,
	"status" text DEFAULT 'active',
	"created_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"order_item_id" integer,
	"sale_id" uuid,
	"sale_line_id" integer,
	"exchange_order_id" uuid,
	"user_id" uuid,
	"channel" text DEFAULT 'in_store' NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"customer_name" text,
	"product_id" text NOT NULL,
	"product_name" text,
	"qty" integer NOT NULL,
	"reason" text,
	"condition" text DEFAULT 'new',
	"resolution_type" text DEFAULT 'refund',
	"status" text DEFAULT 'pending',
	"admin_notes" text,
	"refund_amount" integer,
	"refund_id" text,
	"refund_method" text,
	"refunded_at" timestamp with time zone,
	"tracking_number" text,
	"return_address" jsonb,
	"images" jsonb DEFAULT '[]'::jsonb,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sale_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"version" integer DEFAULT 1,
	"storage_key" text,
	"verification_code" text,
	"printed_at" timestamp with time zone,
	"downloaded_at" timestamp with time zone,
	"reprint_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" integer,
	"inventory_unit_id" uuid,
	"sku" text,
	"product_name_snapshot" text NOT NULL,
	"attributes_snapshot" jsonb DEFAULT '{}'::jsonb,
	"imei_snapshot" jsonb DEFAULT '[]'::jsonb,
	"serial_snapshot" text,
	"warranty_snapshot" jsonb DEFAULT '{}'::jsonb,
	"warranty_policy_id" integer,
	"warranty_starts_at" timestamp with time zone,
	"warranty_expires_at" timestamp with time zone,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"cost_price" integer,
	"discount_amount" integer DEFAULT 0,
	"tax_amount" integer DEFAULT 0,
	"line_total" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount" integer NOT NULL,
	"provider_reference" text,
	"status" text DEFAULT 'confirmed',
	"received_at" timestamp with time zone DEFAULT now(),
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_number" text NOT NULL,
	"invoice_number" text NOT NULL,
	"barcode_value" text,
	"channel" text DEFAULT 'POS' NOT NULL,
	"customer_id" uuid,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" text,
	"store_id" text,
	"register_session_id" integer,
	"cashier_id" uuid,
	"status" text DEFAULT 'completed' NOT NULL,
	"subtotal" integer NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer NOT NULL,
	"paid_amount" integer NOT NULL,
	"change_amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"verification_token_hash" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"finalized_at" timestamp with time zone,
	CONSTRAINT "sales_sale_number_unique" UNIQUE("sale_number"),
	CONSTRAINT "sales_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "sales_barcode_value_unique" UNIQUE("barcode_value"),
	CONSTRAINT "sales_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "scheduled_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"category_id" integer,
	"amount" integer NOT NULL,
	"actual_amount" integer,
	"due_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_date" timestamp with time zone,
	"paid_amount" integer,
	"payment_method" text,
	"payment_reference" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"receipt_url" text,
	"created_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"carrier" text NOT NULL,
	"tracking_no" text NOT NULL,
	"status" text DEFAULT 'pending',
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "spec_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	CONSTRAINT "spec_templates_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"role" text DEFAULT 'staff' NOT NULL,
	"store_location" text DEFAULT 'Play Store Downtown',
	"is_active" boolean DEFAULT true,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"personal_email" text,
	"date_of_birth" date,
	"gender" text,
	"address" text,
	"city" text,
	"nid_number" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"photo_url" text,
	"designation" text,
	"department" text,
	"joined_at" date,
	"employment_type" text DEFAULT 'full_time',
	"education" jsonb DEFAULT '[]'::jsonb,
	"experience" jsonb DEFAULT '[]'::jsonb,
	"employee_code" text,
	"monthly_salary" integer,
	"basic_salary" integer,
	"housing_allowance" integer DEFAULT 0,
	"transport_allowance" integer DEFAULT 0,
	"medical_allowance" integer DEFAULT 0,
	"other_allowance" integer DEFAULT 0,
	"provident_fund_rate" integer DEFAULT 0,
	"salary_effective_from" date,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "staff_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_id" integer NOT NULL,
	"variant_id" integer,
	"unit_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_number" text NOT NULL,
	"from_location" text NOT NULL,
	"to_location" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	CONSTRAINT "stock_transfers_transfer_number_unique" UNIQUE("transfer_number")
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_order_id" text,
	"amount" integer NOT NULL,
	"payment_date" timestamp with time zone DEFAULT now(),
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"reference" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"tone" text DEFAULT 'info' NOT NULL,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "supplier_types_name_unique" UNIQUE("name"),
	CONSTRAINT "supplier_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'company' NOT NULL,
	"contact_person" text,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"notes" text,
	"opening_balance" integer DEFAULT 0,
	"nid_number" bigint,
	"dob" text,
	"nid_images" jsonb DEFAULT '[]'::jsonb,
	"verification_status" text DEFAULT 'unverified',
	"verification_notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "unit_specs" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unit_specs_unit_id_label_unique" UNIQUE("unit_id","label")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"avatar_url" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"loyalty_points" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "variant_attribute_values" (
	"variant_id" integer NOT NULL,
	"attribute_value_id" integer NOT NULL,
	CONSTRAINT "variant_attribute_values_variant_id_attribute_value_id_unique" UNIQUE("variant_id","attribute_value_id")
);
--> statement-breakpoint
CREATE TABLE "warranties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_line_id" integer,
	"unit_id" uuid,
	"customer_id" uuid,
	"policy_id" integer,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active',
	"terms_snapshot" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warranty_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warranty_id" uuid,
	"unit_id" uuid,
	"customer_id" uuid,
	"claim_number" text NOT NULL,
	"issue_description" text,
	"intake_condition" text,
	"status" text DEFAULT 'requested',
	"diagnosis" text,
	"resolution" text,
	"cost" integer,
	"received_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"assigned_to" uuid
);
--> statement-breakpoint
CREATE TABLE "warranty_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"claim_id" uuid,
	"event_type" text NOT NULL,
	"note" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warranty_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"duration_value" integer DEFAULT 0 NOT NULL,
	"duration_unit" text DEFAULT 'days' NOT NULL,
	"coverage_type" text DEFAULT 'standard' NOT NULL,
	"terms" text,
	"exclusions" text,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wishlist_items_user_id_product_id_unique" UNIQUE("user_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_inventory_unit_id_inventory_units_id_fk" FOREIGN KEY ("inventory_unit_id") REFERENCES "public"."inventory_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_expense_items" ADD CONSTRAINT "daily_expense_items_daily_expense_id_daily_expenses_id_fk" FOREIGN KEY ("daily_expense_id") REFERENCES "public"."daily_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD CONSTRAINT "exchange_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD CONSTRAINT "exchange_orders_trade_in_product_id_products_id_fk" FOREIGN KEY ("trade_in_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD CONSTRAINT "exchange_orders_trade_in_product_variant_id_product_variants_id_fk" FOREIGN KEY ("trade_in_product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD CONSTRAINT "exchange_orders_new_product_variant_id_product_variants_id_fk" FOREIGN KEY ("new_product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_orders" ADD CONSTRAINT "exchange_orders_new_device_warranty_policy_id_warranty_policies_id_fk" FOREIGN KEY ("new_device_warranty_policy_id") REFERENCES "public"."warranty_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_parent_id_expense_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reimbursed_to_users_id_fk" FOREIGN KEY ("reimbursed_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_settings" ADD CONSTRAINT "feature_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_unit_id_inventory_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_batch_id_inventory_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."inventory_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_warranty_policy_id_warranty_policies_id_fk" FOREIGN KEY ("warranty_policy_id") REFERENCES "public"."warranty_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash" ADD CONSTRAINT "petty_cash_custodian_id_users_id_fk" FOREIGN KEY ("custodian_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_petty_cash_id_petty_cash_id_fk" FOREIGN KEY ("petty_cash_id") REFERENCES "public"."petty_cash"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_warranty_policy_id_warranty_policies_id_fk" FOREIGN KEY ("warranty_policy_id") REFERENCES "public"."warranty_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expense_templates" ADD CONSTRAINT "recurring_expense_templates_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expense_templates" ADD CONSTRAINT "recurring_expense_templates_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expense_templates" ADD CONSTRAINT "recurring_expense_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_exchange_order_id_exchange_orders_id_fk" FOREIGN KEY ("exchange_order_id") REFERENCES "public"."exchange_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_inventory_unit_id_inventory_units_id_fk" FOREIGN KEY ("inventory_unit_id") REFERENCES "public"."inventory_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_warranty_policy_id_warranty_policies_id_fk" FOREIGN KEY ("warranty_policy_id") REFERENCES "public"."warranty_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_register_session_id_cash_registers_id_fk" FOREIGN KEY ("register_session_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_expenses" ADD CONSTRAINT "scheduled_expenses_template_id_recurring_expense_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."recurring_expense_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_expenses" ADD CONSTRAINT "scheduled_expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_expenses" ADD CONSTRAINT "scheduled_expenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_expenses" ADD CONSTRAINT "scheduled_expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_unit_id_inventory_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_specs" ADD CONSTRAINT "unit_specs_unit_id_inventory_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_attribute_value_id_attribute_values_id_fk" FOREIGN KEY ("attribute_value_id") REFERENCES "public"."attribute_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_unit_id_inventory_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_policy_id_warranty_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."warranty_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_warranty_id_warranties_id_fk" FOREIGN KEY ("warranty_id") REFERENCES "public"."warranties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_unit_id_inventory_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_events" ADD CONSTRAINT "warranty_events_claim_id_warranty_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."warranty_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_events" ADD CONSTRAINT "warranty_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_batches_fifo_idx" ON "inventory_batches" USING btree ("variant_id","location_id","received_at");