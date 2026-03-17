-- Add reminder_at and reminder_sent columns to plans table
-- For automatic notification generation via Edge Function

ALTER TABLE plans
ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE NOT NULL;

COMMENT ON COLUMN plans.reminder_at IS 'Calculated timestamp when reminder should be sent (start_time - reminder_minutes)';
COMMENT ON COLUMN plans.reminder_sent IS 'Flag to prevent duplicate reminder notifications';

-- Create index for efficient querying by Edge Function
CREATE INDEX IF NOT EXISTS idx_plans_reminder_at_sent
ON plans(reminder_at, reminder_sent)
WHERE reminder_at IS NOT NULL AND reminder_sent = FALSE;
