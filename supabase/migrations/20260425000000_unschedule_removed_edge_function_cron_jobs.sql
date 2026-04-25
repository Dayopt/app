-- 削除済 Edge Function (check-reminders / daily-insights) の pg_cron ジョブを unschedule
--
-- 経緯:
--   先行 migration (20260421130516_drop_notifications_table.sql) では
--   `cleanup-notifications` のみ unschedule していたが、production / staging では
--   Supabase Dashboard 経由で `check-reminders` (毎分) / `daily-insights` (毎日 14:00 UTC)
--   も手動 schedule されているケースがあり、そのままでは削除済 Edge Function に対して
--   cron が叩き続けて pg_cron が連続 fail する。
--
-- 既存 migration を後追い変更すると idempotency が崩れるため、補完用の追加 migration
-- として分離。未登録環境では `EXCEPTION WHEN OTHERS THEN NULL` で握り潰す。

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname IN ('check-reminders', 'daily-insights');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- cron 拡張がない / ジョブが未登録なら無視
    NULL;
END;
$$;
