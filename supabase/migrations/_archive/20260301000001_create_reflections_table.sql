-- Session 2.1: reflections テーブル作成
-- 振り返りレポートの永続化基盤

-- ============================================================
-- Step 1: reflections テーブル
-- ============================================================
CREATE TABLE reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  title TEXT NOT NULL,
  -- AI生成コンテンツ
  activities JSONB NOT NULL DEFAULT '[]',
  insights TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  -- AI使用量トラッキング
  model_used TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  -- ユーザーメモ（振り返り後の手書きノート）
  user_note TEXT NOT NULL DEFAULT '',
  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同一ユーザー・期間種別・開始日のレポートは1つだけ（冪等性保証）
  UNIQUE (user_id, period_type, period_start)
);

-- ============================================================
-- Step 2: インデックス
-- ============================================================
CREATE INDEX idx_reflections_user_period ON reflections (user_id, period_type, period_start DESC);

-- ============================================================
-- Step 3: RLS ポリシー
-- ============================================================
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のレポートのみ参照可能
CREATE POLICY "Users can view own reflections"
  ON reflections FOR SELECT
  USING (auth.uid() = user_id);

-- ユーザーは自分のレポートのみ作成可能
CREATE POLICY "Users can create own reflections"
  ON reflections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分のレポートのみ更新可能（user_noteのみ想定）
CREATE POLICY "Users can update own reflections"
  ON reflections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分のレポートのみ削除可能
CREATE POLICY "Users can delete own reflections"
  ON reflections FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- Step 4: updated_at 自動更新トリガー
-- ============================================================
CREATE TRIGGER set_reflections_updated_at
  BEFORE UPDATE ON reflections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
