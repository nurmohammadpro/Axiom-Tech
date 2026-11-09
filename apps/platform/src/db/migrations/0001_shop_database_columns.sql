ALTER TABLE "tenants" ADD COLUMN "neon_role" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "db_url_encrypted" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "provisioned_at" timestamp with time zone;