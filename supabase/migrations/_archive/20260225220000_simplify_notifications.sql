-- notifications テーブルをリマインダー専用にスリム化
-- reminder + overdue の2タイプのみに絞り、不要カラム・制約を削除

-- 不要タイプの既存データ削除
DELETE FROM notifications WHERE type NOT IN ('reminder', 'overdue');

-- notifications: 不要カラム削除
ALTER TABLE notifications
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS message,
  DROP COLUMN IF EXISTS related_tag_id,
  DROP COLUMN IF EXISTS action_url,
  DROP COLUMN IF EXISTS icon,
  DROP COLUMN IF EXISTS data,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS updated_at;

-- related_plan_id → plan_id にリネーム
ALTER TABLE notifications RENAME COLUMN related_plan_id TO plan_id;

-- type制約を更新
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reminder', 'overdue'));

-- notification_preferences: 不要カラム削除
ALTER TABLE notification_preferences
  DROP COLUMN IF EXISTS enable_email_notifications,
  DROP COLUMN IF EXISTS enable_push_notifications,
  DROP COLUMN IF EXISTS enable_reminders,
  DROP COLUMN IF EXISTS enable_plan_updates,
  DROP COLUMN IF EXISTS enable_trash_warnings,
  DROP COLUMN IF EXISTS enable_system_notifications,
  DROP COLUMN IF EXISTS delivery_settings;

-- インデックス更新
DROP INDEX IF EXISTS idx_notification_preferences_delivery_settings;
DROP INDEX IF EXISTS idx_notifications_related_plan;
CREATE INDEX IF NOT EXISTS idx_notifications_plan_id ON notifications(plan_id);

-- updated_atトリガー削除
DROP TRIGGER IF EXISTS set_notifications_updated_at ON notifications;

COMMENT ON TABLE notifications IS 'リマインダー通知テーブル - reminder（事前）と overdue（期限超過）';
COMMENT ON COLUMN notifications.type IS '通知タイプ: reminder | overdue';
COMMENT ON COLUMN notifications.plan_id IS '対象プランID';
