-- 0011: Free-text color on purchase order line items.
-- Metadata captured at purchase intake; stored on the PO only — does not
-- touch variants, inventory units, or receiving.

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS color text;
