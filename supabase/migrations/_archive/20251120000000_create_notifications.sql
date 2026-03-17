-- Create notifications table
-- BoxLog notification system for reminders, events, and system messages

-- notifications テーブル作成
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 通知の分類
  type TEXT NOT NULL CHECK (type IN (
    'reminder',           -- リマインダー（チケット開始前）
    'plan_created',     -- チケット作成
    'plan_updated',     -- チケット更新
    'plan_deleted',     -- チケット削除
    'plan_completed',   -- チケット完了
    'trash_warning',      -- ゴミ箱自動削除警告
    'system'              -- システム通知
  )),

  -- 優先度
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (
    'urgent',   -- 緊急（赤）
    'high',     -- 高（オレンジ）
    'medium',   -- 中（青）
    'low'       -- 低（グレー）
  )),

  -- 通知内容
  title TEXT NOT NULL,
  message TEXT,

  -- 関連データ（plansテーブルへの参照）
  related_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  related_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
  action_url TEXT,  -- クリック時の遷移先（例: /inbox?id=xxx）

  -- メタデータ
  icon TEXT CHECK (icon IN ('bell', 'calendar', 'trash', 'alert', 'check', 'info')),
  data JSONB DEFAULT '{}',  -- 拡張用データ

  -- 状態管理
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,  -- 通知の有効期限（任意）

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_related_plan ON notifications(related_plan_id);

-- Row Level Security (RLS) 有効化
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: ユーザーは自分の通知のみ閲覧可能
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- RLS ポリシー: ユーザーは自分の通知のみ更新可能
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS ポリシー: ユーザーは自分の通知のみ削除可能
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- RLS ポリシー: システムは通知を作成可能（service_role キーで実行）
CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- 自動 updated_at トリガー（update_updated_at_column 関数は既存を想定）
CREATE TRIGGER set_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 古い通知の自動削除関数（既読かつ30日経過）
CREATE OR REPLACE FUNCTION delete_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM notifications
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND is_read = true;
END;
$$;

COMMENT ON TABLE notifications IS '通知テーブル - リマインダー、チケット変更、システムメッセージを管理';
COMMENT ON COLUMN notifications.type IS '通知タイプ（reminder, plan_created, plan_updated, etc）';
COMMENT ON COLUMN notifications.priority IS '優先度（urgent, high, medium, low）';
COMMENT ON COLUMN notifications.related_plan_id IS '関連チケットID（plansテーブル参照）';
COMMENT ON COLUMN notifications.action_url IS 'クリック時の遷移先URL';
COMMENT ON COLUMN notifications.data IS '拡張用JSONBデータ';
COMMENT ON COLUMN notifications.expires_at IS '通知の有効期限（オプション）';
