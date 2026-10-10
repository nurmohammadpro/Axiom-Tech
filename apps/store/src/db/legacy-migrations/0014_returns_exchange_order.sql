-- Link returns back to the exchange order that handed the device over. Devices
-- given out via an exchange have no POS sale line, so this is what lets them be
-- returned and restocked like any other sold unit.
ALTER TABLE "returns" ADD COLUMN IF NOT EXISTS "exchange_order_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "returns"
    ADD CONSTRAINT "returns_exchange_order_id_exchange_orders_id_fk"
    FOREIGN KEY ("exchange_order_id") REFERENCES "exchange_orders"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "returns_exchange_order_id_idx" ON "returns" ("exchange_order_id");
