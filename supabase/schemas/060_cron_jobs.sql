-- ============================================================
-- pg_cron ジョブ一覧（読み物用 — CLIでは使用しない）
-- ============================================================
-- ローカル: baseline.sql で自動登録
-- 本番/staging: Supabase Dashboard > Database > pg_cron で手動設定
-- ============================================================

-- 全ジョブは UTC 03:00-03:30 帯に集中（深夜のオフピーク時間）

-- | ジョブ名                    | スケジュール    | 対象関数                         | 保持期間  |
-- |-----------------------------|-----------------|----------------------------------|-----------|
-- | cleanup-notifications       | 20 3 * * * (毎日 03:20) | delete_old_notifications()      | 既読30日  |
-- | cleanup-plan-activities     | 30 3 * * * (毎日 03:30) | cleanup_old_plan_activities()   | 365日     |

-- Edge Function の定期実行（pg_cron → Vault + pg_net HTTP呼び出し）:
-- | ジョブ名                    | スケジュール            | Edge Function          |
-- |-----------------------------|-------------------------|------------------------|
-- | check-reminders             | * * * * * (毎分)        | check-reminders        |
-- | daily-insights              | 0 14 * * * (毎日 14:00 UTC = JST 23:00) | daily-insights |
--
-- Dashboard での設定手順:
-- 1. Supabase Dashboard > Database > Extensions > pg_net を有効化
-- 2. Vault シークレットが登録済みであることを確認:
--    SELECT name FROM vault.decrypted_secrets WHERE name IN ('supabase_url', 'service_role_key');
-- 3. SQL Editor で以下を実行（Vault からシークレットを自動取得するため URL/キーの直書き不要）:
--    SELECT cron.schedule('check-reminders', '* * * * *', $$
--      SELECT public.invoke_edge_function('check-reminders');
--    $$);
