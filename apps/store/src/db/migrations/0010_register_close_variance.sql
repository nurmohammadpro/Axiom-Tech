-- 0010: Register close-out variance.
--
-- cash_registers sessions now record an audited close: the counted closing
-- balance is compared against expected cash (opening balance + POS cash sales
-- − cash refunds since the session opened), and the difference is stored as
-- `variance`. `note` captures the close-out remark, `closed_by` records who
-- closed the session.
--
-- No backfill: existing closed sessions predate variance tracking.

ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS variance integer;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES users (id);
