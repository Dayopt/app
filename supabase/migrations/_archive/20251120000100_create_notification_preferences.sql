-- Create notification_preferences table
-- User-specific notification settings

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 通知チャネル設定
  enable_browser_notifications BOOLEAN NOT NULL DEFAULT false,
  enable_email_notifications BOOLEAN NOT NULL DEFAULT false,
  enable_push_notifications BOOLEAN NOT NULL DEFAULT false,

  -- タイプ別有効/無効
  enable_reminders BOOLEAN NOT NULL DEFAULT true,
  enable_plan_updates BOOLEAN NOT NULL DEFAULT true,
  enable_trash_warnings BOOLEAN NOT NULL DEFAULT true,
  enable_system_notifications BOOLEAN NOT NULL DEFAULT true,

  -- リマインダー設定
  default_reminder_minutes INTEGER DEFAULT 15 CHECK (default_reminder_minutes > 0),

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス作成
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Row Level Security (RLS) 有効化
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: ユーザーは自分の設定のみ閲覧可能
CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

-- RLS ポリシー: ユーザーは自分の設定のみ更新可能
CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS ポリシー: ユーザーは自分の設定のみ作成可能
CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 自動 updated_at トリガー
CREATE TRIGGER set_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 新規ユーザー登録時にデフォルト設定を自動作成する関数
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 新規ユーザー作成時のトリガー（auth.usersテーブル）
CREATE TRIGGER on_auth_user_created_notification_preferences
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_preferences();

COMMENT ON TABLE notification_preferences IS 'ユーザー別通知設定テーブル';
COMMENT ON COLUMN notification_preferences.enable_browser_notifications IS 'ブラウザ通知の有効/無効';
COMMENT ON COLUMN notification_preferences.enable_email_notifications IS 'メール通知の有効/無効';
COMMENT ON COLUMN notification_preferences.enable_push_notifications IS 'プッシュ通知の有効/無効';
COMMENT ON COLUMN notification_preferences.default_reminder_minutes IS 'デフォルトリマインダー時間（分）';
