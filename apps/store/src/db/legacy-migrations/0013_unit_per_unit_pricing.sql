-- Add per-unit pricing and code fields to inventory_units
ALTER TABLE inventory_units 
ADD COLUMN IF NOT EXISTS cost_code TEXT,
ADD COLUMN IF NOT EXISTS d_code TEXT,
ADD COLUMN IF NOT EXISTS sell_code TEXT,
ADD COLUMN IF NOT EXISTS color TEXT;