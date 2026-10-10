-- Per-unit specifications (RAM, Storage, Color, etc.) linked to inventory units
-- Allows capturing specs at intake (purchase/exchange) and syncing to catalog

CREATE TABLE IF NOT EXISTS unit_specs (
    id SERIAL PRIMARY KEY,
    unit_id UUID NOT NULL REFERENCES inventory_units(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (unit_id, label)
);

-- Index for fast lookups by unit
CREATE INDEX IF NOT EXISTS unit_specs_unit_id_idx ON unit_specs(unit_id);

-- Index for querying specs by label across units
CREATE INDEX IF NOT EXISTS unit_specs_label_idx ON unit_specs(label);