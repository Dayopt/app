-- plan_instances テーブル作成
-- 繰り返しプランの個別オカレンス（例外処理対応）

CREATE TABLE IF NOT EXISTS plan_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,

  -- オカレンスの日時（親プランからオーバーライド可能）
  instance_date DATE NOT NULL,
  instance_start TIMESTAMPTZ,
  instance_end TIMESTAMPTZ,

  -- 例外フラグ
  is_exception BOOLEAN NOT NULL DEFAULT FALSE,
  exception_type TEXT CHECK (exception_type IN ('modified', 'cancelled', 'moved')),

  -- 例外時のオーバーライド値（JSON形式）
  -- title, description, start_time, end_time などを個別に上書き可能
  overrides JSONB DEFAULT '{}',

  -- 元の日付（moved時に使用：元々どの日だったか）
  original_date DATE,

  -- メタデータ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ユニーク制約：同じプランの同じ日に複数インスタンスは作れない
  UNIQUE(plan_id, instance_date)
);

-- インデックス
CREATE INDEX idx_plan_instances_plan_id ON plan_instances(plan_id);
CREATE INDEX idx_plan_instances_instance_date ON plan_instances(instance_date);
CREATE INDEX idx_plan_instances_is_exception ON plan_instances(is_exception) WHERE is_exception = TRUE;

-- RLS ポリシー
ALTER TABLE plan_instances ENABLE ROW LEVEL SECURITY;

-- 自分のプランのインスタンスのみアクセス可能
CREATE POLICY "Users can view own plan instances"
  ON plan_instances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_instances.plan_id
      AND plans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own plan instances"
  ON plan_instances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_instances.plan_id
      AND plans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own plan instances"
  ON plan_instances FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_instances.plan_id
      AND plans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own plan instances"
  ON plan_instances FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_instances.plan_id
      AND plans.user_id = auth.uid()
    )
  );

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_plan_instances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_plan_instances_updated_at
  BEFORE UPDATE ON plan_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_plan_instances_updated_at();

-- コメント
COMMENT ON TABLE plan_instances IS '繰り返しプランの個別オカレンス（例外処理対応）';
COMMENT ON COLUMN plan_instances.instance_date IS 'オカレンスの日付';
COMMENT ON COLUMN plan_instances.is_exception IS '例外フラグ（通常のオカレンスはFALSE、変更/削除されたものはTRUE）';
COMMENT ON COLUMN plan_instances.exception_type IS '例外タイプ: modified=変更, cancelled=削除, moved=移動';
COMMENT ON COLUMN plan_instances.overrides IS '例外時のオーバーライド値（JSON）';
COMMENT ON COLUMN plan_instances.original_date IS '移動前の元日付（movedタイプ時に使用）';
