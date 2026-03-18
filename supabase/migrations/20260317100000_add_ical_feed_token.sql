-- iCalフィード用トークンをuser_settingsに追加
-- UUID v4トークンでフィードURLを認証（推測不可能）
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS ical_feed_token UUID DEFAULT gen_random_uuid();

-- トークンの一意性を担保
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_ical_feed_token
  ON user_settings (ical_feed_token)
  WHERE ical_feed_token IS NOT NULL;
