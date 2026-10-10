-- Case-insensitive unique names for brands and categories.
-- "NIKE", "nike " and "Nike" collapse to one entry via lower(btrim(name)).
--
-- Applied manually (the drizzle journal only registers 0000-0002):
--   bun run scripts/apply-catalog-unique-migration.ts
--
-- Safe on re-run (IF NOT EXISTS). products is intentionally NOT indexed:
-- duplicate pairs with sales history are being kept for now, so a unique
-- index on products would fail to create; the API-level duplicate checks
-- enforce the product rule instead (see scripts/verify-catalog-duplicates.ts).

CREATE UNIQUE INDEX IF NOT EXISTS brands_name_unique ON brands (lower(btrim(name)));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_unique ON categories (lower(btrim(name)));
