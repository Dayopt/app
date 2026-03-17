-- =============================================================
-- 認証関連テーブルのRLSセキュリティ修正
--
-- 修正内容:
-- 1. auth_audit_logs: INSERT ポリシーを service_role のみに制限
--    → 任意ユーザーが偽の監査ログを書き込めるバグを修正
-- 2. login_attempts: DELETE ポリシーを自分のメールに制限
--    → 他ユーザーのロックアウト履歴を削除できるバグを修正
-- =============================================================

-- 1. auth_audit_logs: INSERT を service_role のみに制限
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.auth_audit_logs;
CREATE POLICY "Service role can insert audit logs"
  ON public.auth_audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 2. login_attempts: DELETE を自分のメールアドレスに制限
DROP POLICY IF EXISTS "Users can delete own login attempts" ON public.login_attempts;
CREATE POLICY "Users can delete own login attempts"
  ON public.login_attempts
  FOR DELETE
  TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = (SELECT auth.uid()))
  );
