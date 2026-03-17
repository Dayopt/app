-- RLSポリシーの最適化: auth.uid() を (select auth.uid()) に変更
-- これにより、行ごとの再評価を防ぎパフォーマンスが向上する
-- 参考: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ============================================
-- plans テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view own plans" ON public.plans;
DROP POLICY IF EXISTS "Users can insert own plans" ON public.plans;
DROP POLICY IF EXISTS "Users can update own plans" ON public.plans;
DROP POLICY IF EXISTS "Users can delete own plans" ON public.plans;

CREATE POLICY "Users can view own plans" ON public.plans
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own plans" ON public.plans
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own plans" ON public.plans
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own plans" ON public.plans
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- tags テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view own tags" ON public.tags;
DROP POLICY IF EXISTS "Users can insert own tags" ON public.tags;
DROP POLICY IF EXISTS "Users can update own tags" ON public.tags;
DROP POLICY IF EXISTS "Users can delete own tags" ON public.tags;

CREATE POLICY "Users can view own tags" ON public.tags
  FOR SELECT USING (((select auth.uid()) = user_id) OR (user_id IS NULL));

CREATE POLICY "Users can insert own tags" ON public.tags
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own tags" ON public.tags
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own tags" ON public.tags
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- plan_tags テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view own plan_tags" ON public.plan_tags;
DROP POLICY IF EXISTS "Users can insert own plan_tags" ON public.plan_tags;
DROP POLICY IF EXISTS "Users can delete own plan_tags" ON public.plan_tags;

CREATE POLICY "Users can view own plan_tags" ON public.plan_tags
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own plan_tags" ON public.plan_tags
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own plan_tags" ON public.plan_tags
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- plan_instances テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view own plan instances" ON public.plan_instances;
DROP POLICY IF EXISTS "Users can insert own plan instances" ON public.plan_instances;
DROP POLICY IF EXISTS "Users can update own plan instances" ON public.plan_instances;
DROP POLICY IF EXISTS "Users can delete own plan instances" ON public.plan_instances;

CREATE POLICY "Users can view own plan instances" ON public.plan_instances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_instances.plan_id
      AND plans.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can insert own plan instances" ON public.plan_instances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_instances.plan_id
      AND plans.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can update own plan instances" ON public.plan_instances
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_instances.plan_id
      AND plans.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete own plan instances" ON public.plan_instances
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_instances.plan_id
      AND plans.user_id = (select auth.uid())
    )
  );

-- ============================================
-- plan_activities テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view activities of their own plans" ON public.plan_activities;
DROP POLICY IF EXISTS "Users can create activities for their own plans" ON public.plan_activities;

CREATE POLICY "Users can view activities of their own plans" ON public.plan_activities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_activities.plan_id
      AND plans.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can create activities for their own plans" ON public.plan_activities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = plan_activities.plan_id
      AND plans.user_id = (select auth.uid())
    ) AND user_id = (select auth.uid())
  );

-- ============================================
-- notifications テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- notification_preferences テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;

CREATE POLICY "Users can view own notification preferences" ON public.notification_preferences
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own notification preferences" ON public.notification_preferences
  FOR UPDATE USING ((select auth.uid()) = user_id);

-- ============================================
-- user_settings テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON public.user_settings;

CREATE POLICY "Users can view own settings" ON public.user_settings
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own settings" ON public.user_settings
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR UPDATE USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own settings" ON public.user_settings
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- auth_audit_logs テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.auth_audit_logs;

CREATE POLICY "Users can view own audit logs" ON public.auth_audit_logs
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ============================================
-- mfa_recovery_codes テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view own recovery codes" ON public.mfa_recovery_codes;

CREATE POLICY "Users can view own recovery codes" ON public.mfa_recovery_codes
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ============================================
-- records テーブル
-- ============================================
DROP POLICY IF EXISTS "Users can view own records" ON public.records;
DROP POLICY IF EXISTS "Users can insert own records" ON public.records;
DROP POLICY IF EXISTS "Users can update own records" ON public.records;
DROP POLICY IF EXISTS "Users can delete own records" ON public.records;

CREATE POLICY "Users can view own records" ON public.records
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own records" ON public.records
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own records" ON public.records
  FOR UPDATE USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own records" ON public.records
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- audit_logs テーブル (service role用)
-- ============================================
DROP POLICY IF EXISTS "Service role can view audit logs" ON public.audit_logs;

CREATE POLICY "Service role can view audit logs" ON public.audit_logs
  FOR SELECT USING ((select auth.jwt() ->> 'role') = 'service_role');
