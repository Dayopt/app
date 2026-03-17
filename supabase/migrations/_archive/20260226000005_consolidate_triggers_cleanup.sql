-- ==================================================================
-- INFO: 重複インデックス削除 + updated_at トリガー関数の統一
-- ==================================================================

-- user_settings 重複インデックス削除
-- UNIQUE(user_id) 制約が自動的に B-tree インデックスを生成するため不要
DROP INDEX IF EXISTS idx_user_settings_user_id;

-- updated_at トリガー関数の統一
-- 同一ロジック (NEW.updated_at = NOW()) の関数が5種類存在
-- → update_updated_at() に統一し、残りを削除

-- Step 1: 各テーブルのトリガーを update_updated_at() に付け替え

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_update_records_updated_at ON records;
CREATE TRIGGER trigger_update_records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_update_plan_instances_updated_at ON plan_instances;
CREATE TRIGGER trigger_update_plan_instances_updated_at
  BEFORE UPDATE ON plan_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_update_user_settings_updated_at ON user_settings;
CREATE TRIGGER trigger_update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_ai_usage_updated_at ON ai_usage;
CREATE TRIGGER update_ai_usage_updated_at
  BEFORE UPDATE ON ai_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_chat_conversations_updated_at ON chat_conversations;
CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Step 2: 旧名トリガーも削除（Step 1 でドロップできなかった別名のもの）
DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON notification_preferences;
DROP TRIGGER IF EXISTS update_records_updated_at ON records;
DROP TRIGGER IF EXISTS user_settings_updated_at ON user_settings;

-- Step 3: 不要な関数を削除
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS handle_updated_at();
DROP FUNCTION IF EXISTS update_plan_instances_updated_at();
DROP FUNCTION IF EXISTS update_user_settings_updated_at();
