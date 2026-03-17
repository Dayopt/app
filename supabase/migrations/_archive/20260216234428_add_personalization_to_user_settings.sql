-- Add personalization columns to user_settings
ALTER TABLE user_settings
ADD COLUMN personalization_values JSONB DEFAULT '{}'::jsonb,
ADD COLUMN ai_communication_style TEXT DEFAULT 'coach'
  CHECK (ai_communication_style IN ('coach', 'analyst', 'friendly', 'custom')),
ADD COLUMN ai_custom_style_prompt TEXT DEFAULT '';
