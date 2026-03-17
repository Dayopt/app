-- チケットアクティビティ（変更履歴）テーブル
CREATE TABLE IF NOT EXISTS plan_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'created',
    'updated',
    'status_changed',
    'priority_changed',
    'title_changed',
    'description_changed',
    'due_date_changed',
    'time_changed',
    'tag_added',
    'tag_removed',
    'deleted'
  )),
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_plan_activities_plan_id ON plan_activities(plan_id);
CREATE INDEX idx_plan_activities_user_id ON plan_activities(user_id);
CREATE INDEX idx_plan_activities_created_at ON plan_activities(created_at DESC);
CREATE INDEX idx_plan_activities_action_type ON plan_activities(action_type);

-- RLSポリシー
ALTER TABLE plan_activities ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のチケットのアクティビティのみ閲覧可能
CREATE POLICY "Users can view activities of their own plans"
  ON plan_activities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_activities.plan_id
      AND plans.user_id = auth.uid()
    )
  );

-- ユーザーは自分のチケットのアクティビティのみ作成可能
CREATE POLICY "Users can create activities for their own plans"
  ON plan_activities
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_activities.plan_id
      AND plans.user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- コメント追加
COMMENT ON TABLE plan_activities IS 'チケットの変更履歴を記録するテーブル';
COMMENT ON COLUMN plan_activities.action_type IS 'アクション種別（created, updated, status_changed等）';
COMMENT ON COLUMN plan_activities.field_name IS '変更されたフィールド名';
COMMENT ON COLUMN plan_activities.old_value IS '変更前の値';
COMMENT ON COLUMN plan_activities.new_value IS '変更後の値';
COMMENT ON COLUMN plan_activities.metadata IS '追加のメタデータ（JSON形式）';
