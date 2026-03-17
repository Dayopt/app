-- Add delivery_settings JSON column to notification_preferences
-- This allows per-notification-type delivery method configuration (ChatGPT style)

-- Add the new JSON column
ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS delivery_settings JSONB DEFAULT '{
  "reminders": ["browser"],
  "plan_updates": ["browser"],
  "system": ["browser"]
}'::jsonb;

-- Add a comment to describe the column
COMMENT ON COLUMN notification_preferences.delivery_settings IS 'Per-notification-type delivery method settings. Keys: reminders, plan_updates, system. Values: array of "browser", "email", "push"';

-- Create an index for JSON queries
CREATE INDEX IF NOT EXISTS idx_notification_preferences_delivery_settings
ON notification_preferences USING gin (delivery_settings);
