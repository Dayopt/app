-- ai_usage テーブルと関連RPC関数を削除
-- 理由: AI feature を一括削除したため不要

-- RPC関数削除
DROP FUNCTION IF EXISTS public.increment_ai_usage(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_weekly_reflection_data(UUID, TEXT);

-- トリガー削除
DROP TRIGGER IF EXISTS update_ai_usage_updated_at ON public.ai_usage;

-- RLSポリシー削除
DROP POLICY IF EXISTS "Users can view own ai_usage" ON public.ai_usage;
DROP POLICY IF EXISTS "Users can insert own ai_usage" ON public.ai_usage;
DROP POLICY IF EXISTS "Users can update own ai_usage" ON public.ai_usage;

-- テーブル削除
DROP TABLE IF EXISTS public.ai_usage;
