-- record_activities / record_tags の制約・RLS整合マイグレーション
-- plan側で整備済みのパターンをrecord側にも適用する

-- =============================================================
-- Part 1: record_activities CHECK制約追加
-- Zodスキーマ (src/schemas/records/activity.ts) と整合
-- =============================================================

ALTER TABLE record_activities ADD CONSTRAINT record_activities_action_type_check
  CHECK (action_type IN (
    'created', 'updated', 'time_changed',
    'title_changed', 'memo_changed', 'fulfillment_changed',
    'tag_added', 'tag_removed',
    'deleted'
  ));

-- =============================================================
-- Part 2: record_tags RLS最適化
-- auth.uid() → (select auth.uid()) でサブクエリキャッシュ化
-- ref: 20260127100000_optimize_rls_policies_auth_uid.sql
-- =============================================================

DROP POLICY IF EXISTS "Users can view own record_tags" ON public.record_tags;
DROP POLICY IF EXISTS "Users can insert own record_tags" ON public.record_tags;
DROP POLICY IF EXISTS "Users can delete own record_tags" ON public.record_tags;

CREATE POLICY "Users can view own record_tags" ON public.record_tags
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own record_tags" ON public.record_tags
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own record_tags" ON public.record_tags
  FOR DELETE USING ((select auth.uid()) = user_id);

-- =============================================================
-- Part 3: record_activities RLS最適化
-- =============================================================

DROP POLICY IF EXISTS "Users can view own record activities" ON public.record_activities;
DROP POLICY IF EXISTS "Users can insert own record activities" ON public.record_activities;

CREATE POLICY "Users can view own record activities" ON public.record_activities
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own record activities" ON public.record_activities
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
