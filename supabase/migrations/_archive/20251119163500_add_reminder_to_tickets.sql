-- Add reminder_minutes column to plans table
-- For notification functionality (e.g., 10 minutes before, 1 day before)

ALTER TABLE plans
ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER;

COMMENT ON COLUMN plans.reminder_minutes IS 'Number of minutes before start_time to send reminder notification (NULL = no reminder)';
