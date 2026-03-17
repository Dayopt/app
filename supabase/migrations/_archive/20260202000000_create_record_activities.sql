-- Record Activities テーブル作成
-- Plan Activitiesと同様の構造で、Recordの変更履歴を記録

CREATE TABLE IF NOT EXISTS record_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID REFERENCES records(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_record_activities_record_id ON record_activities(record_id);
CREATE INDEX IF NOT EXISTS idx_record_activities_user_id ON record_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_record_activities_created_at ON record_activities(created_at DESC);

-- RLSを有効化
ALTER TABLE record_activities ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: 自分のアクティビティのみ参照可能
CREATE POLICY "Users can view own record activities"
  ON record_activities
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLSポリシー: 自分のアクティビティのみ作成可能
CREATE POLICY "Users can insert own record activities"
  ON record_activities
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- コメント追加
COMMENT ON TABLE record_activities IS 'Recordの変更履歴を記録するテーブル';
COMMENT ON COLUMN record_activities.action_type IS 'アクション種別: created, time_changed, fulfillment_changed, tag_added, tag_removed, etc.';
