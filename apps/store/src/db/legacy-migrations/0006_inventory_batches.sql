-- FIFO batches: each receiving event gets a batch carrying the rate its units
-- were bought at. Units link to their batch, and sale lines snapshot the batch
-- cost so profit reflects the real purchase rate and stays frozen.
CREATE TABLE IF NOT EXISTS "inventory_batches" (
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
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_batches_fifo_idx" ON "inventory_batches" ("variant_id","location_id","received_at");
--> statement-breakpoint
ALTER TABLE "inventory_units" ADD COLUMN IF NOT EXISTS "batch_id" uuid;
--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_batch_id_inventory_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN IF NOT EXISTS "cost_price" integer;
