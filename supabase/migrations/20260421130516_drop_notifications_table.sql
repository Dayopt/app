-- notifications 機能を launch 前に削除
--
-- 削除対象:
--   1. pg_cron ジョブ cleanup-notifications（毎日 03:20 UTC で delete_old_notifications() を実行）
--   2. delete_old_notifications() 関数（notifications テーブルからの arch）
--   3. get_active_users_for_daily_insights(), get_daily_snapshots() 関数（daily-insights Edge Function 専用）
--   4. notifications テーブル本体（関連 index / RLS policy / FK は CASCADE で自動削除）
--
-- Edge Function（daily-insights / check-reminders）は先行 commit で既に削除済。

-- 1. cron ジョブを unschedule（存在しない環境では握り潰す）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'cleanup-notifications';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- cron 拡張がない / ジョブが未登録なら無視
    NULL;
END;
$$;

-- 2. notifications 用のクリーンアップ関数を削除
DROP FUNCTION IF EXISTS public.delete_old_notifications();

-- 3. daily-insights Edge Function 用のヘルパー関数を削除
DROP FUNCTION IF EXISTS public.get_active_users_for_daily_insights(DATE, INTEGER);
DROP FUNCTION IF EXISTS public.get_daily_snapshots(UUID, INTEGER);

-- 4. notifications テーブルを DROP（CASCADE で index / policy / FK も削除）
DROP TABLE IF EXISTS public.notifications CASCADE;
