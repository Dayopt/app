-- Fix: get_context_switches マルチタグエントリでスイッチ数が膨張するバグ
-- Fix: get_energy_map がUTC固定でユーザーTZを無視するバグ

-- =============================================================================
-- 1. get_context_switches: エントリ単位で1タグに集約してからLAGを取る
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_context_switches(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_switches BIGINT;
  v_days BIGINT;
BEGIN
  WITH entry_primary_tag AS (
    -- エントリごとに1つのタグに絞る（最初に付けたタグ = MIN(tag_id)）
    SELECT DISTINCT ON (e.id)
      e.id,
      e.start_time,
      e.start_time::DATE AS entry_date,
      et.tag_id
    FROM public.entries e
    LEFT JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
    WHERE e.user_id = p_user_id
      AND e.start_time IS NOT NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time < p_end_date)
    ORDER BY e.id, et.tag_id
  ),
  ordered_entries AS (
    SELECT
      id,
      entry_date,
      tag_id,
      LAG(tag_id) OVER (PARTITION BY entry_date ORDER BY start_time) AS prev_tag_id
    FROM entry_primary_tag
  ),
  daily_switches AS (
    SELECT
      entry_date,
      COUNT(*) FILTER (
        WHERE prev_tag_id IS NOT NULL
          AND (tag_id IS DISTINCT FROM prev_tag_id)
      )::BIGINT AS switches
    FROM ordered_entries
    GROUP BY entry_date
  )
  SELECT
    COALESCE(SUM(switches), 0)::BIGINT,
    GREATEST(COUNT(DISTINCT entry_date), 1)::BIGINT
  INTO v_total_switches, v_days
  FROM daily_switches;

  RETURN json_build_object(
    'totalSwitches', v_total_switches,
    'avgPerDay', CASE WHEN v_days > 0 THEN (v_total_switches::DOUBLE PRECISION / v_days) ELSE 0 END
  );
END;
$$;

-- =============================================================================
-- 2. get_energy_map: ユーザーのタイムゾーンを使用
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_energy_map(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  hour INT,
  dow INT,
  avg_fulfillment DOUBLE PRECISION,
  total_minutes DOUBLE PRECISION,
  entry_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  -- ユーザーのタイムゾーンを取得（未設定ならUTC）
  SELECT COALESCE(p.timezone, 'UTC')
  INTO v_tz
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_tz IS NULL THEN
    v_tz := 'UTC';
  END IF;

  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM e.start_time AT TIME ZONE v_tz)::INT AS hour,
    EXTRACT(DOW FROM e.start_time AT TIME ZONE v_tz)::INT AS dow,
    AVG(e.fulfillment_score)::DOUBLE PRECISION AS avg_fulfillment,
    SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60)::DOUBLE PRECISION AS total_minutes,
    COUNT(*)::BIGINT AS entry_count
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date)
  GROUP BY
    EXTRACT(HOUR FROM e.start_time AT TIME ZONE v_tz)::INT,
    EXTRACT(DOW FROM e.start_time AT TIME ZONE v_tz)::INT
  ORDER BY 1, 2;
END;
$$;
