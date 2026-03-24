-- Remove recurrence columns from entries table
-- No recurring entries exist in production, so this is a safe removal.

ALTER TABLE entries
  DROP COLUMN IF EXISTS recurrence_type,
  DROP COLUMN IF EXISTS recurrence_rule,
  DROP COLUMN IF EXISTS recurrence_end_date;
