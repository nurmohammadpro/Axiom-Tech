-- Add imei_snapshot to order_items for tracking IMEI on online/portal orders
ALTER TABLE "order_items" ADD COLUMN "imei_snapshot" jsonb;
