-- notification_preferences にメール通知・プッシュ通知の設定カラムを追加
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS enable_email_notifications boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_push_notifications boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN notification_preferences.enable_email_notifications IS 'メール通知ON/OFF';
COMMENT ON COLUMN notification_preferences.enable_push_notifications IS 'プッシュ通知ON/OFF（将来用）';
