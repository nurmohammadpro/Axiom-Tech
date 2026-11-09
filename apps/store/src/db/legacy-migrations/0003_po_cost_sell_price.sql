ALTER TABLE "purchase_order_items" DROP COLUMN "unit_price";--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "cost_price" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "sell_price" integer NOT NULL DEFAULT 0;
