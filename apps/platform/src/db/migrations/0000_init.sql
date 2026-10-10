CREATE TYPE "public"."invoice_kind" AS ENUM('activation', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('due', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('activation', 'monthly', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('banglaqr', 'cash', 'bkash', 'nagad', 'bank', 'other');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'billing', 'support');--> statement-breakpoint
CREATE TYPE "public"."provision_status" AS ENUM('pending', 'provisioning', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tenant_source" AS ENUM('admin', 'self_signup');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('trial', 'active', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "invoices_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tenant_id" uuid NOT NULL,
	"kind" "invoice_kind" NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'due' NOT NULL,
	"due_date" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"proof_url" text,
	"months" integer DEFAULT 0 NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_price" integer NOT NULL,
	"signup_fee" integer NOT NULL,
	"max_staff" integer,
	"max_warehouses" integer,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "platform_role" DEFAULT 'support' NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tenant_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"owner_name" text NOT NULL,
	"owner_email" text NOT NULL,
	"owner_phone" text,
	"plan_id" text NOT NULL,
	"status" "tenant_status" DEFAULT 'trial' NOT NULL,
	"source" "tenant_source" DEFAULT 'admin' NOT NULL,
	"trial_ends_at" timestamp with time zone NOT NULL,
	"activated_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"suspended_reason" text,
	"provision_status" "provision_status" DEFAULT 'pending' NOT NULL,
	"provision_error" text,
	"neon_project_id" text,
	"neon_database" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_platform_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_events" ADD CONSTRAINT "tenant_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_events" ADD CONSTRAINT "tenant_events_actor_id_platform_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_created_by_platform_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_seq_uq" ON "invoices" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "payments_tenant_idx" ON "payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_method_reference_uq" ON "payments" USING btree ("method","reference");--> statement-breakpoint
CREATE INDEX "tenant_events_tenant_idx" ON "tenant_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenants_owner_email_idx" ON "tenants" USING btree ("owner_email");