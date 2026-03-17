-- ============================================================
-- pg_cron ジョブ一覧（読み物用 — CLIでは使用しない）
-- ============================================================
-- ローカル: baseline.sql で自動登録
-- 本番/staging: Supabase Dashboard > Database > pg_cron で手動設定
-- ============================================================

-- 全ジョブは UTC 03:00-03:30 帯に集中（深夜のオフピーク時間）

-- | ジョブ名                    | スケジュール    | 対象関数                         | 保持期間  |
-- |-----------------------------|-----------------|----------------------------------|-----------|
-- | cleanup-login-attempts      | 0 3 * * * (毎日 03:00) | cleanup_old_login_attempts()     | 90日      |
-- | cleanup-auth-audit-logs     | 10 3 * * * (毎日 03:10) | cleanup_old_auth_audit_logs()   | 365日     |
-- | cleanup-notifications       | 20 3 * * * (毎日 03:20) | delete_old_notifications()      | 既読30日  |
-- | cleanup-plan-activities     | 30 3 * * * (毎日 03:30) | cleanup_old_plan_activities()   | 365日     |

-- Edge Function の定期実行（pg_cron → HTTP呼び出し）:
-- | ジョブ名                    | スケジュール            | Edge Function          |
-- |-----------------------------|-------------------------|------------------------|
-- | check-reminders             | * * * * * (毎分)        | check-reminders        |
-- | generate-reflections        | 0 0 * * 1 (月曜 00:00)  | generate-reflections   |
