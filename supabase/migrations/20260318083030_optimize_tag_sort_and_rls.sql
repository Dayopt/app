-- ============================================================
-- P1: TagService N+1クエリ修正 + RLSポリシー最適化
-- ============================================================

-- 1. タグsort_order一括インクリメントRPC
--    タグ作成時に全既存タグのsort_orderを+1する処理を
--    N回の個別UPDATEから1回のSQLに最適化
CREATE OR REPLACE FUNCTION public.increment_tag_sort_orders(p_user_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.tags
  SET sort_order = COALESCE(sort_order, 0) + 1
  WHERE user_id = p_user_id;
$$;

-- 2. RLSポリシー最適化: reflections テーブル
--    auth.uid() → (select auth.uid()) でステートメントレベルキャッシュを有効化
--    （行ごとの関数呼び出しを回避し 94-99% 高速化）
DROP POLICY IF EXISTS "Users can view own reflections" ON public.reflections;
CREATE POLICY "Users can view own reflections" ON public.reflections
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own reflections" ON public.reflections;
CREATE POLICY "Users can create own reflections" ON public.reflections
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own reflections" ON public.reflections;
CREATE POLICY "Users can update own reflections" ON public.reflections
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own reflections" ON public.reflections;
CREATE POLICY "Users can delete own reflections" ON public.reflections
  FOR DELETE USING ((select auth.uid()) = user_id);

-- 3. RLSポリシー最適化: notification_preferences INSERT
--    INSERT のみ auth.uid() 直呼び → (select auth.uid()) に統一
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert own notification preferences" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
