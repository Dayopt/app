-- plan_activities / record_activities:
--   1. schema_version カラム追加（フォーマット変更の追跡用）
--   2. リテンション用クリーンアップ関数 + pg_cronジョブ（365日）

-- =====================================================
-- 1. schema_version カラム追加
-- =====================================================

-- plan_activities: 既存レコードは v1（日本語ラベル等）、新規は v2（生値保存）
ALTER TABLE plan_activities
  ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 2;

-- 既存レコードを v1 に設定（デフォルト2で作られるが、マイグレーション以前のデータは v1）
UPDATE plan_activities SET schema_version = 1
  WHERE schema_version = 2
  AND created_at < NOW();

-- record_activities: 同様
ALTER TABLE record_activities
  ADD COLUMN IF NOT EXISTS schema_version SMALLINT NOT NULL DEFAULT 2;

UPDATE record_activities SET schema_version = 1
  WHERE schema_version = 2
  AND created_at < NOW();

-- コメント
COMMENT ON COLUMN plan_activities.schema_version IS 'アクティビティ記録フォーマットのバージョン（v1=旧フォーマット, v2=生値保存）';
COMMENT ON COLUMN record_activities.schema_version IS 'アクティビティ記録フォーマットのバージョン（v1=旧フォーマット, v2=生値保存）';

-- =====================================================
-- 2. リテンション: クリーンアップ関数
-- =====================================================

-- plan_activities: 365日以上前のレコードを削除
CREATE OR REPLACE FUNCTION public.cleanup_old_plan_activities()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    DELETE FROM plan_activities
    WHERE created_at < NOW() - INTERVAL '365 days';
END;
$function$;

COMMENT ON FUNCTION public.cleanup_old_plan_activities IS 'plan_activitiesテーブルの古いレコードを削除（365日以上前）';

-- record_activities: 365日以上前のレコードを削除
CREATE OR REPLACE FUNCTION public.cleanup_old_record_activities()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    DELETE FROM record_activities
    WHERE created_at < NOW() - INTERVAL '365 days';
END;
$function$;

COMMENT ON FUNCTION public.cleanup_old_record_activities IS 'record_activitiesテーブルの古いレコードを削除（365日以上前）';

-- =====================================================
-- 3. リテンション: pg_cronジョブ登録
-- =====================================================

-- plan_activities: 毎日 03:30 UTC（12:30 JST）
SELECT cron.schedule(
  'cleanup-plan-activities',
  '30 3 * * *',
  'SELECT public.cleanup_old_plan_activities()'
);

-- record_activities: 毎日 03:40 UTC（12:40 JST）
SELECT cron.schedule(
  'cleanup-record-activities',
  '40 3 * * *',
  'SELECT public.cleanup_old_record_activities()'
);
