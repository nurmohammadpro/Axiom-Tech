ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "parent_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_parent_id_categories_id_fk'
  ) THEN
    ALTER TABLE "categories"
      ADD CONSTRAINT "categories_parent_id_categories_id_fk"
      FOREIGN KEY ("parent_id") REFERENCES "categories"("id");
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "categories" ("name", "slug")
VALUES ('Phones', 'phones')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
UPDATE "categories" child
SET "parent_id" = parent."id"
FROM "categories" parent
WHERE parent."slug" = 'phones'
  AND child."slug" IN ('pre-owned-phones', 'unofficial-new', 'official-new');
--> statement-breakpoint
UPDATE "categories" child
SET "parent_id" = parent."id"
FROM "categories" parent
WHERE parent."slug" = 'accessories'
  AND child."slug" IN (
    'portable-speakers',
    'tws',
    'wireless-neckband',
    'smart-watch-',
    'power-bank',
    'wireless-microphones'
  );