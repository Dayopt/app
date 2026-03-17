-- pg_cron によるデータクリーンアップの定期実行設定
-- 対象: login_attempts(90日), auth_audit_logs(365日), notifications(30日・既読のみ)
-- スケジュール: 毎日 03:00-03:20 UTC（12:00-12:20 JST）低トラフィック帯

-- pg_cron 拡張を有効化（Supabase Pro プランで利用可能）
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 1. login_attempts: 毎日 03:00 UTC に 90日以上前のレコードを削除
SELECT cron.schedule(
  'cleanup-login-attempts',
  '0 3 * * *',
  'SELECT public.cleanup_old_login_attempts()'
);

-- 2. auth_audit_logs: 毎日 03:10 UTC に 365日以上前のレコードを削除
SELECT cron.schedule(
  'cleanup-auth-audit-logs',
  '10 3 * * *',
  'SELECT public.cleanup_old_auth_audit_logs()'
);

-- 3. notifications: 毎日 03:20 UTC に 30日以上前の既読通知を削除
SELECT cron.schedule(
  'cleanup-notifications',
  '20 3 * * *',
  'SELECT public.delete_old_notifications()'
);
