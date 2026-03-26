-- =============================================================================
-- week_starts_on サポート
--
-- PostgreSQL の date_trunc('week', ...) は ISO 8601 準拠で常に月曜始まり。
-- 日曜始まり (0) や土曜始まり (6) のユーザーに対応するため:
-- 1. user_settings に week_starts_on カラムを追加
-- 2. 汎用ヘルパー関数 trunc_week_tz を作成
-- 3. get_weekly_focus_score と get_plan_summary をこの関数を使うよう更新
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. user_settings に week_starts_on カラムを追加
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS week_starts_on INT NOT NULL DEFAULT 1
    CHECK (week_starts_on IN (0, 1, 6));

COMMENT ON COLUMN public.user_settings.week_starts_on IS
  '週の開始曜日: 0=日曜, 1=月曜, 6=土曜';

-- -----------------------------------------------------------------------------
-- 2. trunc_week_tz — 週の開始日を考慮したタイムゾーン対応の週境界計算
--
-- 仕組み:
--   ISO 8601 の date_trunc('week', ...) は月曜始まりを返す。
--   week_start 日数分を引いてから date_trunc し、再度 week_start 日数を足すことで
--   任意の曜日始まりの週境界を計算できる。
--
-- 例: 日曜始まり (week_start=0) の場合、シフト量は 0 なので純粋な日曜境界。
--     月曜始まり (week_start=1) は標準の date_trunc と同等。
--     土曜始まり (week_start=6) の場合、6日戻してから date_trunc し、6日進める。
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trunc_week_tz(
  ts TIMESTAMPTZ,
  tz TEXT,
  week_start INT DEFAULT 1
) RETURNS TIMESTAMPTZ AS $$
  SELECT date_trunc('week', (ts AT TIME ZONE tz) - ((week_start) || ' days')::interval)
         + (week_start || ' days')::interval
         AT TIME ZONE tz;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

COMMENT ON FUNCTION public.trunc_week_tz(TIMESTAMPTZ, TEXT, INT) IS
  '週の開始曜日 (0=日, 1=月, 6=土) を考慮してタイムゾーン付きの週境界を返す';

GRANT EXECUTE ON FUNCTION public.trunc_week_tz(TIMESTAMPTZ, TEXT, INT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. get_weekly_focus_score — week_starts_on を反映
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_weekly_focus_score(
  p_user_id UUID,
  p_weeks INT DEFAULT 12
)
RETURNS TABLE(week TEXT, focus_score NUMERIC, total_hours NUMERIC, unique_tags INT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz          TEXT;
  v_week_start  INT;
  v_start_date  TIMESTAMPTZ;
BEGIN
  v_tz         := COALESCE(public.get_user_timezone(p_user_id), 'UTC');
  v_week_start := COALESCE(
    (SELECT week_starts_on FROM public.user_settings WHERE user_id = p_user_id),
    1
  );

  -- 現在の週の開始をユーザーの週設定に合わせて計算し、p_weeks 週前を起点とする
  v_start_date := public.trunc_week_tz(now(), v_tz, v_week_start)
                  - (p_weeks || ' weeks')::INTERVAL;

  RETURN QUERY
    SELECT
      to_char(public.trunc_week_tz(e.start_time, v_tz, v_week_start), 'YYYY-MM-DD'),
      ROUND(
        CASE
          WHEN COUNT(DISTINCT e.tag_id) = 0 THEN 0
          ELSE (1.0 / COUNT(DISTINCT e.tag_id)) * 100
        END::NUMERIC, 1
      ),
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600
      )::NUMERIC, 2),
      COUNT(DISTINCT e.tag_id)::INT
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND e.start_time >= v_start_date
    GROUP BY public.trunc_week_tz(e.start_time, v_tz, v_week_start)
    ORDER BY 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. get_plan_summary — week_starts_on を反映
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_plan_summary(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz          TEXT;
  v_week_start  INT;
  v_total_count INT;
  v_monthly_hours NUMERIC;
  v_weekly_hours  NUMERIC;
BEGIN
  v_tz         := COALESCE(public.get_user_timezone(p_user_id), 'UTC');
  v_week_start := COALESCE(
    (SELECT week_starts_on FROM public.user_settings WHERE user_id = p_user_id),
    1
  );

  SELECT COUNT(*) INTO v_total_count
  FROM public.entries
  WHERE user_id = p_user_id AND deleted_at IS NULL;

  SELECT COALESCE(ROUND(SUM(
    EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
  )::NUMERIC, 1), 0) INTO v_monthly_hours
  FROM public.entries
  WHERE user_id = p_user_id
    AND deleted_at IS NULL
    AND start_time >= date_trunc('month', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;

  SELECT COALESCE(ROUND(SUM(
    EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
  )::NUMERIC, 1), 0) INTO v_weekly_hours
  FROM public.entries
  WHERE user_id = p_user_id
    AND deleted_at IS NULL
    AND start_time >= public.trunc_week_tz(now(), v_tz, v_week_start);

  RETURN json_build_object(
    'totalCount', v_total_count,
    'monthlyHours', v_monthly_hours,
    'weeklyHours', v_weekly_hours
  );
END;
$$;
