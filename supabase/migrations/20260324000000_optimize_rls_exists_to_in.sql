-- RLSポリシーの最適化: EXISTS + JOIN → IN operator に変更
-- IN operator の方がPostgreSQLのクエリプランナーが効率的に処理できる
-- 参考: https://supabase.com/docs/guides/database/postgres/row-level-security#policies-with-joins

-- ============================================
-- entry_instances テーブル（4ポリシー）
-- ============================================
DROP POLICY IF EXISTS "Users can view own plan instances" ON public.entry_instances;
DROP POLICY IF EXISTS "Users can insert own plan instances" ON public.entry_instances;
DROP POLICY IF EXISTS "Users can update own plan instances" ON public.entry_instances;
DROP POLICY IF EXISTS "Users can delete own plan instances" ON public.entry_instances;

CREATE POLICY "Users can view own plan instances" ON public.entry_instances
  FOR SELECT USING (
    entry_id IN (SELECT id FROM public.entries WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "Users can insert own plan instances" ON public.entry_instances
  FOR INSERT WITH CHECK (
    entry_id IN (SELECT id FROM public.entries WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "Users can update own plan instances" ON public.entry_instances
  FOR UPDATE USING (
    entry_id IN (SELECT id FROM public.entries WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "Users can delete own plan instances" ON public.entry_instances
  FOR DELETE USING (
    entry_id IN (SELECT id FROM public.entries WHERE user_id = (select auth.uid()))
  );

-- ============================================
-- entry_activities テーブル（2ポリシー）
-- ============================================
DROP POLICY IF EXISTS "Users can view activities of their own plans" ON public.entry_activities;
DROP POLICY IF EXISTS "Users can create activities for their own plans" ON public.entry_activities;

CREATE POLICY "Users can view activities of their own plans" ON public.entry_activities
  FOR SELECT USING (
    entry_id IN (SELECT id FROM public.entries WHERE user_id = (select auth.uid()))
    OR user_id = (select auth.uid())
  );

CREATE POLICY "Users can create activities for their own plans" ON public.entry_activities
  FOR INSERT WITH CHECK (
    entry_id IN (SELECT id FROM public.entries WHERE user_id = (select auth.uid()))
    AND user_id = (select auth.uid())
  );
