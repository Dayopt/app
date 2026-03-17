-- =====================================================
-- Record Tags テーブル作成
-- Records とタグの多対多関連付け（plan_tags と同パターン）
-- =====================================================

-- record_tags テーブル
CREATE TABLE IF NOT EXISTS public.record_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ユニーク制約（同じRecord-Tagの重複防止）
  CONSTRAINT record_tags_record_tag_unique UNIQUE (record_id, tag_id)
);

-- コメント
COMMENT ON TABLE public.record_tags IS 'Records とタグの多対多関連付け';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_record_tags_record_id ON public.record_tags(record_id);
CREATE INDEX IF NOT EXISTS idx_record_tags_tag_id ON public.record_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_record_tags_user_id ON public.record_tags(user_id);

-- RLS 有効化
ALTER TABLE public.record_tags ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: ユーザーは自分の record_tags のみ操作可能
CREATE POLICY "Users can view own record_tags"
  ON public.record_tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own record_tags"
  ON public.record_tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own record_tags"
  ON public.record_tags FOR DELETE
  USING (auth.uid() = user_id);
