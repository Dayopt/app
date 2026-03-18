-- Stats KPI Functions
-- Review タブの KPI メトリクス用 DB 関数群
-- tRPC statistics router から呼び出される

-- =============================================================================
-- 1. get_plan_rate: 計画率（planned エントリ / 全エントリ）
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_plan_rate(
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
  v_total BIGINT;
  v_planned BIGINT;
BEGIN
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE origin = 'planned')::BIGINT
  INTO v_total, v_planned
  FROM public.entries
  WHERE user_id = p_user_id
    AND (p_start_date IS NULL OR start_time >= p_start_date)
    AND (p_end_date IS NULL OR start_time < p_end_date);

  RETURN json_build_object(
    'totalEntries', v_total,
    'plannedEntries', v_planned,
    'planRate', CASE WHEN v_total > 0 THEN (v_planned::DOUBLE PRECISION / v_total) ELSE 0 END
  );
END;
$$;

-- =============================================================================
-- 2. get_estimation_accuracy: タグ別の見積もり精度
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_estimation_accuracy(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  tag_id UUID,
  tag_name TEXT,
  tag_color TEXT,
  avg_planned_minutes DOUBLE PRECISION,
  avg_actual_minutes DOUBLE PRECISION,
  avg_deviation_minutes DOUBLE PRECISION,
  entry_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS tag_id,
    t.name AS tag_name,
    COALESCE(t.color, 'indigo') AS tag_color,
    AVG(e.duration_minutes)::DOUBLE PRECISION AS avg_planned_minutes,
    AVG(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60)::DOUBLE PRECISION AS avg_actual_minutes,
    AVG(
      ABS(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60 - e.duration_minutes)
    )::DOUBLE PRECISION AS avg_deviation_minutes,
    COUNT(*)::BIGINT AS entry_count
  FROM public.entries e
  JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
  JOIN public.tags t ON t.id = et.tag_id
  WHERE e.user_id = p_user_id
    AND e.origin = 'planned'
    AND e.duration_minutes IS NOT NULL
    AND e.duration_minutes > 0
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date)
  GROUP BY t.id, t.name, t.color
  HAVING COUNT(*) >= 2
  ORDER BY COUNT(*) DESC;
END;
$$;

-- =============================================================================
-- 3. get_context_switches: 日ごとのタグ切替回数
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
  -- 連続するエントリ間でタグが変わった回数をカウント
  WITH ordered_entries AS (
    SELECT
      e.id,
      e.start_time::DATE AS entry_date,
      et.tag_id,
      LAG(et.tag_id) OVER (PARTITION BY e.start_time::DATE ORDER BY e.start_time) AS prev_tag_id
    FROM public.entries e
    LEFT JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
    WHERE e.user_id = p_user_id
      AND e.start_time IS NOT NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time < p_end_date)
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
-- 4. get_blank_rate: 活動可能時間のうち空き時間の割合
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_blank_rate(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_wake_hour INTEGER DEFAULT 7,
  p_sleep_hour INTEGER DEFAULT 23
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INTEGER;
  v_available_minutes INTEGER;
  v_scheduled_minutes BIGINT;
  v_blank_minutes INTEGER;
BEGIN
  -- 期間内の日数
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_days := GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400);
  ELSE
    v_days := 7; -- デフォルト1週間
  END IF;

  -- 1日あたりの活動可能時間（分）× 日数
  v_available_minutes := (p_sleep_hour - p_wake_hour) * 60 * v_days;

  -- スケジュールされた合計時間
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
  ), 0)::BIGINT
  INTO v_scheduled_minutes
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date);

  v_blank_minutes := GREATEST(0, v_available_minutes - v_scheduled_minutes);

  RETURN json_build_object(
    'availableMinutes', v_available_minutes,
    'scheduledMinutes', v_scheduled_minutes,
    'blankMinutes', v_blank_minutes,
    'blankRate', CASE
      WHEN v_available_minutes > 0 THEN (v_blank_minutes::DOUBLE PRECISION / v_available_minutes)
      ELSE 0
    END
  );
END;
$$;

-- =============================================================================
-- 5. get_energy_map: スキーマ更新（avg_fulfillment + total_minutes 追加）
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
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM e.start_time AT TIME ZONE 'UTC')::INT AS hour,
    EXTRACT(DOW FROM e.start_time AT TIME ZONE 'UTC')::INT AS dow,
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
    EXTRACT(HOUR FROM e.start_time AT TIME ZONE 'UTC')::INT,
    EXTRACT(DOW FROM e.start_time AT TIME ZONE 'UTC')::INT
  ORDER BY 1, 2;
END;
$$;

-- =============================================================================
-- 6. get_cumulative_time: 期間内の合計記録時間
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_cumulative_time(
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
  v_total_minutes DOUBLE PRECISION;
BEGIN
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
  ), 0)
  INTO v_total_minutes
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date);

  RETURN json_build_object(
    'totalMinutes', v_total_minutes
  );
END;
$$;

-- =============================================================================
-- 7. get_avg_fulfillment: 期間内の平均充実度
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_avg_fulfillment(
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
  v_avg DOUBLE PRECISION;
  v_count BIGINT;
BEGIN
  SELECT
    AVG(e.fulfillment_score)::DOUBLE PRECISION,
    COUNT(e.fulfillment_score)::BIGINT
  INTO v_avg, v_count
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.fulfillment_score IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date);

  RETURN json_build_object(
    'avgFulfillment', v_avg,
    'entryCount', v_count
  );
END;
$$;
