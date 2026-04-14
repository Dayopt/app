-- reflections テーブルを削除
-- 理由: AI振り返り機能は未実装であり、アプリコードからクエリされていないため不要。
--       再実装時にスキーマを再設計する。

-- トリガー削除
DROP TRIGGER IF EXISTS update_reflections_updated_at ON public.reflections;

-- RLSポリシー削除
DROP POLICY IF EXISTS "Users can view own reflections" ON public.reflections;
DROP POLICY IF EXISTS "Users can create own reflections" ON public.reflections;
DROP POLICY IF EXISTS "Users can update own reflections" ON public.reflections;
DROP POLICY IF EXISTS "Users can delete own reflections" ON public.reflections;

-- テーブル削除
DROP TABLE IF EXISTS public.reflections;
