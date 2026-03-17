-- ==================================================================
-- plans + records → entries 統合マイグレーション
--
-- 1. plans にカラム追加（origin, fulfillment_score, duration_minutes）
-- 2. records データを plans に移行（DATE+TIME → TIMESTAMPTZ変換）
-- 3. record_tags → plan_tags, record_activities → plan_activities 移行
-- 4. status カラム廃止、completed_at → reviewed_at リネーム
-- 5. テーブル・カラムリネーム（plans → entries 等）
-- 6. 統計関数の更新（entries 参照に変更）
-- 7. クリーンアップ関数・pg_cronの更新
-- 8. 旧テーブル削除
-- ==================================================================

-- ============================================================
-- Step 1: plans テーブルにカラム追加
-- ============================================================

-- origin: エントリの生まれ方
ALTER TABLE plans ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'planned';
ALTER TABLE plans ADD CONSTRAINT plans_origin_check
  CHECK (origin IN ('planned', 'unplanned'));

-- fulfillment_score: 充実度（3段階）
ALTER TABLE plans ADD COLUMN IF NOT EXISTS fulfillment_score INT;
ALTER TABLE plans ADD CONSTRAINT plans_fulfillment_score_check
  CHECK (fulfillment_score BETWEEN 1 AND 3);

-- duration_minutes: 所要時間
ALTER TABLE plans ADD COLUMN IF NOT EXISTS duration_minutes INT;

-- 一時カラム: records→plans マッピング追跡用（後で削除）
ALTER TABLE plans ADD COLUMN _source_record_id UUID;

-- ============================================================
-- Step 2: records データを plans に移行
-- ============================================================
-- records の DATE+TIME を TIMESTAMPTZ に変換
-- ユーザーのタイムゾーンを考慮して変換する

WITH record_data AS (
  SELECT
    r.*,
    COALESCE(us.timezone, 'Asia/Tokyo') AS tz
  FROM records r
  LEFT JOIN user_settings us ON us.user_id = r.user_id
)
INSERT INTO plans (
  user_id, title, description,
  start_time, end_time, duration_minutes,
  fulfillment_score, origin, completed_at,
  _source_record_id,
  created_at, updated_at
)
SELECT
  rd.user_id,
  COALESCE(rd.title, ''),
  rd.description,
  -- start_time: TIME → TIMESTAMPTZ（ユーザーTZ考慮）
  CASE
    WHEN rd.start_time IS NOT NULL THEN
      (rd.worked_at || 'T' || rd.start_time)::timestamp AT TIME ZONE rd.tz
    ELSE NULL
  END,
  -- end_time: TIME → TIMESTAMPTZ、なければstart + durationで算出
  -- DST対策: 先にUTC変換してからduration加算
  CASE
    WHEN rd.end_time IS NOT NULL THEN
      (rd.worked_at || 'T' || rd.end_time)::timestamp AT TIME ZONE rd.tz
    WHEN rd.start_time IS NOT NULL THEN
      ((rd.worked_at || 'T' || rd.start_time)::timestamp AT TIME ZONE rd.tz)
        + rd.duration_minutes * interval '1 minute'
    ELSE NULL
  END,
  rd.duration_minutes,
  -- fulfillment_score: 5段階 → 3段階
  CASE
    WHEN rd.fulfillment_score IN (1, 2) THEN 1
    WHEN rd.fulfillment_score = 3 THEN 2
    WHEN rd.fulfillment_score IN (4, 5) THEN 3
    ELSE NULL
  END,
  -- origin: plan_idがあれば'planned'、なければ'unplanned'
  CASE WHEN rd.plan_id IS NOT NULL THEN 'planned' ELSE 'unplanned' END,
  -- completed_at（→ reviewed_at）: 充実度入力済みなら設定
  CASE WHEN rd.fulfillment_score IS NOT NULL THEN rd.created_at ELSE NULL END,
  rd.id,
  rd.created_at,
  rd.updated_at
FROM record_data rd;

-- ============================================================
-- Step 3: record_tags → plan_tags 移行
-- ============================================================

INSERT INTO plan_tags (user_id, plan_id, tag_id, created_at)
SELECT rt.user_id, p.id, rt.tag_id, rt.created_at
FROM record_tags rt
JOIN plans p ON p._source_record_id = rt.record_id
ON CONFLICT (plan_id, tag_id) DO NOTHING;

-- ============================================================
-- Step 4: plan_activities CHECK制約を拡張 + record_activities 移行
-- ============================================================

-- fulfillment_changed を追加
ALTER TABLE plan_activities DROP CONSTRAINT IF EXISTS plan_activities_action_type_check;
ALTER TABLE plan_activities ADD CONSTRAINT plan_activities_action_type_check
  CHECK (action_type IN (
    'created', 'updated', 'status_changed',
    'title_changed', 'description_changed', 'time_changed',
    'tag_added', 'tag_removed',
    'recurrence_changed', 'reminder_changed',
    'fulfillment_changed',
    'deleted'
  ));

INSERT INTO plan_activities (
  plan_id, user_id, action_type, field_name,
  old_value, new_value, metadata, schema_version, created_at
)
SELECT
  p.id, ra.user_id, ra.action_type, ra.field_name,
  ra.old_value, ra.new_value, ra.metadata, ra.schema_version, ra.created_at
FROM record_activities ra
JOIN plans p ON p._source_record_id = ra.record_id;

-- ============================================================
-- Step 5: 一時カラム削除
-- ============================================================

ALTER TABLE plans DROP COLUMN _source_record_id;

-- ============================================================
-- Step 6: status カラム廃止 + completed_at → reviewed_at
-- ============================================================

-- status 関連のインデックス削除
DROP INDEX IF EXISTS idx_plans_status;

-- status カラム削除（CHECK制約も自動削除）
ALTER TABLE plans DROP COLUMN status;

-- completed_at → reviewed_at リネーム
ALTER TABLE plans RENAME COLUMN completed_at TO reviewed_at;

-- completed_at インデックスを reviewed_at 用に再作成
DROP INDEX IF EXISTS idx_plans_completed_at;
CREATE INDEX idx_entries_reviewed_at ON plans (reviewed_at)
  WHERE reviewed_at IS NOT NULL;

-- origin インデックス追加
CREATE INDEX idx_entries_origin ON plans (origin);

-- fulfillment_score 部分インデックス追加
CREATE INDEX idx_entries_fulfillment_score ON plans (fulfillment_score)
  WHERE fulfillment_score IS NOT NULL;

-- ============================================================
-- Step 7: テーブルリネーム
-- ============================================================

ALTER TABLE plans RENAME TO entries;
ALTER TABLE plan_tags RENAME TO entry_tags;
ALTER TABLE plan_activities RENAME TO entry_activities;
ALTER TABLE plan_instances RENAME TO entry_instances;

-- FK カラムリネーム
ALTER TABLE entry_tags RENAME COLUMN plan_id TO entry_id;
ALTER TABLE entry_activities RENAME COLUMN plan_id TO entry_id;
ALTER TABLE entry_instances RENAME COLUMN plan_id TO entry_id;
ALTER TABLE notifications RENAME COLUMN plan_id TO entry_id;

-- ============================================================
-- Step 8: 統計関数の更新（plans → entries）
-- ============================================================

-- get_plan_summary: plans → entries, status='closed' → reviewed_at IS NOT NULL
CREATE OR REPLACE FUNCTION get_plan_summary(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_this_month_start TIMESTAMPTZ;
  v_last_month_start TIMESTAMPTZ;
  v_last_month_end TIMESTAMPTZ;
  v_this_week_start TIMESTAMPTZ;
BEGIN
  v_this_month_start := date_trunc('month', NOW());
  v_last_month_start := date_trunc('month', NOW() - INTERVAL '1 month');
  v_last_month_end   := v_this_month_start - INTERVAL '1 second';
  v_this_week_start  := date_trunc('week', NOW());

  SELECT json_build_object(
    'totalHours',       COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)
                          FILTER (WHERE start_time IS NOT NULL AND end_time IS NOT NULL
                                    AND end_time > start_time), 0),
    'thisMonthHours',   COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)
                          FILTER (WHERE start_time IS NOT NULL AND end_time IS NOT NULL
                                    AND end_time > start_time
                                    AND start_time >= v_this_month_start), 0),
    'lastMonthHours',   COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)
                          FILTER (WHERE start_time IS NOT NULL AND end_time IS NOT NULL
                                    AND end_time > start_time
                                    AND start_time >= v_last_month_start
                                    AND start_time <= v_last_month_end), 0),
    'completedTasks',   COUNT(*) FILTER (WHERE reviewed_at IS NOT NULL),
    'thisWeekCompleted', COUNT(*) FILTER (WHERE reviewed_at IS NOT NULL
                                           AND reviewed_at >= v_this_week_start)
  ) INTO result
  FROM entries WHERE user_id = p_user_id;

  RETURN result;
END;
$$;

-- get_active_dates: plans → entries
CREATE OR REPLACE FUNCTION get_active_dates(p_user_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE (active_date DATE)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT (start_time AT TIME ZONE 'UTC')::DATE AS active_date
  FROM entries
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL
    AND start_time >= p_since;
$$;

-- get_daily_hours: plans → entries
CREATE OR REPLACE FUNCTION get_daily_hours(
  p_user_id UUID, p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ
)
RETURNS TABLE (date TEXT, hours DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    to_char(start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) AS hours
  FROM entries
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL AND end_time IS NOT NULL
    AND end_time > start_time
    AND start_time >= p_start_date AND start_time <= p_end_date
  GROUP BY to_char(start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD');
$$;

-- get_hourly_distribution: plans → entries
CREATE OR REPLACE FUNCTION get_hourly_distribution(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (hour INT, hours DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXTRACT(HOUR FROM start_time)::INT AS hour,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) AS hours
  FROM entries
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL AND end_time IS NOT NULL
    AND end_time > start_time
    AND (p_start_date IS NULL OR start_time >= p_start_date)
    AND (p_end_date IS NULL OR start_time <= p_end_date)
  GROUP BY EXTRACT(HOUR FROM start_time)::INT;
$$;

-- get_dow_distribution: plans → entries
CREATE OR REPLACE FUNCTION get_dow_distribution(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (dow INT, hours DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXTRACT(DOW FROM start_time)::INT AS dow,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) AS hours
  FROM entries
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL AND end_time IS NOT NULL
    AND end_time > start_time
    AND (p_start_date IS NULL OR start_time >= p_start_date)
    AND (p_end_date IS NULL OR start_time <= p_end_date)
  GROUP BY EXTRACT(DOW FROM start_time)::INT;
$$;

-- get_monthly_hours: plans → entries
CREATE OR REPLACE FUNCTION get_monthly_hours(p_user_id UUID, p_start_date TIMESTAMPTZ)
RETURNS TABLE (month TEXT, hours DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    to_char(start_time, 'YYYY-MM') AS month,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) AS hours
  FROM entries
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL AND end_time IS NOT NULL
    AND end_time > start_time
    AND start_time >= p_start_date
  GROUP BY to_char(start_time, 'YYYY-MM');
$$;

-- get_total_time: plans → entries
CREATE OR REPLACE FUNCTION get_total_time(p_user_id UUID)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_build_object(
    'totalMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60.0)
                      FILTER (WHERE end_time > start_time), 0),
    'planCount',    COUNT(*) FILTER (WHERE start_time IS NOT NULL AND end_time IS NOT NULL
                                       AND end_time > start_time)
  )
  FROM entries
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL AND end_time IS NOT NULL;
$$;

-- get_tag_stats: plan_tags + record_tags → entry_tags のみ
DROP FUNCTION IF EXISTS get_tag_stats(UUID);

CREATE FUNCTION get_tag_stats(p_user_id UUID)
RETURNS TABLE (
  tag_id UUID,
  plan_count BIGINT,
  record_count BIGINT,
  last_used TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- entry_tags からカウント（plan_count=planned, record_count=unplanned）
  SELECT
    t.id AS tag_id,
    COALESCE(et.planned_cnt, 0) AS plan_count,
    COALESCE(et.unplanned_cnt, 0) AS record_count,
    et.last_used AS last_used
  FROM tags t
  LEFT JOIN (
    SELECT
      etag.tag_id,
      COUNT(*) FILTER (WHERE e.origin = 'planned') AS planned_cnt,
      COUNT(*) FILTER (WHERE e.origin = 'unplanned') AS unplanned_cnt,
      MAX(etag.created_at) AS last_used
    FROM entry_tags etag
    JOIN entries e ON e.id = etag.entry_id
    GROUP BY etag.tag_id
  ) et ON et.tag_id = t.id
  WHERE t.user_id = p_user_id AND t.is_active = true

  UNION ALL

  -- タグなしエントリ数
  SELECT
    NULL::UUID AS tag_id,
    COUNT(*) FILTER (WHERE e.origin = 'planned') AS plan_count,
    COUNT(*) FILTER (WHERE e.origin = 'unplanned') AS record_count,
    MAX(e.created_at) AS last_used
  FROM entries e
  WHERE e.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM entry_tags et WHERE et.entry_id = e.id
    );
$$;

GRANT EXECUTE ON FUNCTION get_tag_stats(UUID) TO authenticated;

COMMENT ON FUNCTION get_tag_stats(UUID) IS
  'ユーザーのタグ統計（エントリ使用回数・最終使用日）を取得。tag_id=NULLはタグなしエントリ件数。';

-- ============================================================
-- Step 9: クリーンアップ関数の更新
-- ============================================================

-- plan_activities → entry_activities
CREATE OR REPLACE FUNCTION public.cleanup_old_plan_activities()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    DELETE FROM entry_activities
    WHERE created_at < NOW() - INTERVAL '365 days';
END;
$function$;

-- record_activities クリーンアップは不要（テーブル削除）
-- pg_cron ジョブを更新
SELECT cron.unschedule('cleanup-record-activities');

-- ============================================================
-- Step 10: 旧テーブルをバックアップしてから削除
-- ============================================================
-- ロールバック用バックアップ（問題がなければ後続マイグレーションで削除）

CREATE TABLE IF NOT EXISTS _backup_records AS SELECT * FROM records;
CREATE TABLE IF NOT EXISTS _backup_record_tags AS SELECT * FROM record_tags;
CREATE TABLE IF NOT EXISTS _backup_record_activities AS SELECT * FROM record_activities;

DROP TABLE IF EXISTS record_activities;
DROP TABLE IF EXISTS record_tags;
DROP TABLE IF EXISTS records;

-- record_activities クリーンアップ関数も削除
DROP FUNCTION IF EXISTS public.cleanup_old_record_activities();

-- ============================================================
-- Step 11: RLS ポリシーの更新（新テーブル名でのアクセス確認）
-- ============================================================
-- PostgreSQL はテーブルリネーム時にRLSポリシーも自動追従するため、
-- ポリシー自体の変更は不要。ポリシー名は旧名のまま残るが機能に影響なし。

-- ============================================================
-- 完了: entries テーブルが plans + records を統合
-- ============================================================
