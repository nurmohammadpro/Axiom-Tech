-- 0009: Unit tracking for bulk products.
--
-- Adds products.track_units so an accessory can be stock-kept as individual
-- inventory_units rows (a real serial when the maker provides one, a
-- system-generated "PSU-{variant}-{seq}" identity otherwise), and makes
-- inventory_units.barcode unique so every generated code is collision-free.
--
-- Legacy rows are safe: track_units defaults to false, and a Postgres unique
-- index ignores NULLs, so existing units with a NULL barcode are unaffected.
--
-- No backfill: accessories never received unit rows before this feature. Any
-- rare identity-less device units (identity_type = 'none', unit_code IS NULL)
-- can be listed afterwards with:
--   SELECT id, variant_id FROM inventory_units
--    WHERE identity_type = 'none' AND unit_code IS NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS track_units boolean NOT NULL DEFAULT false;

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_units_barcode_unique" ON inventory_units (barcode);
