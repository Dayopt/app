-- login_attempts + auth_audit_logs テーブルを削除
-- 理由: Supabase Auth の auth.audit_log と二重管理。アプリコードからの参照もなし。

-- login_attempts
DROP FUNCTION IF EXISTS public.record_login_attempt(TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.cleanup_old_login_attempts();
DROP POLICY IF EXISTS "Service role full access to login_attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Service role can insert login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Users can delete own login attempts" ON public.login_attempts;
DROP TABLE IF EXISTS public.login_attempts;

-- auth_audit_logs
DROP FUNCTION IF EXISTS public.cleanup_old_auth_audit_logs();
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.auth_audit_logs;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.auth_audit_logs;
DROP TABLE IF EXISTS public.auth_audit_logs;

-- pg_cron ジョブ削除
SELECT cron.unschedule('cleanup-login-attempts');
SELECT cron.unschedule('cleanup-auth-audit-logs');
