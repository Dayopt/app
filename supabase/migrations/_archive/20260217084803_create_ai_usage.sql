-- AI利用量トラッキングテーブル
-- 無料枠ユーザーの月間リクエスト数を管理
CREATE TABLE public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

-- RLS有効化
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY "Users can view own usage"
  ON public.ai_usage FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own usage"
  ON public.ai_usage FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own usage"
  ON public.ai_usage FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- インデックス
CREATE INDEX idx_ai_usage_user_month ON public.ai_usage(user_id, month);

-- updated_atトリガー
CREATE TRIGGER update_ai_usage_updated_at
  BEFORE UPDATE ON public.ai_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
