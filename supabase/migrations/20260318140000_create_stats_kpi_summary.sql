-- Unified KPI summary function: 7 individual RPCs → 1 round-trip
-- Called by tRPC getStatsOverview endpoint

CREATE OR REPLACE FUNCTION public.get_stats_kpi_summary(
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
  v_tz TEXT;
  -- cumulative time
  v_total_minutes DOUBLE PRECISION;
  -- avg fulfillment
  v_avg_fulfillment DOUBLE PRECISION;
  v_fulfillment_count BIGINT;
  -- plan rate
  v_total_entries BIGINT;
  v_planned_entries BIGINT;
  -- context switches
  v_total_switches BIGINT;
  v_switch_days BIGINT;
  -- blank rate
  v_days INTEGER;
  v_available_minutes INTEGER;
  v_scheduled_minutes BIGINT;
  v_blank_minutes INTEGER;
BEGIN
  -- IDOR prevention
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  -- Resolve user timezone
  SELECT COALESCE(us.timezone, 'Asia/Tokyo')
  INTO v_tz
  FROM public.user_settings us
  WHERE us.user_id = p_user_id;

  IF v_tz IS NULL THEN
    v_tz := 'Asia/Tokyo';
  END IF;

  -- =========================================================================
  -- 1. Cumulative time (totalMinutes)
  -- =========================================================================
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

  -- =========================================================================
  -- 2. Average fulfillment
  -- =========================================================================
  SELECT
    AVG(e.fulfillment_score)::DOUBLE PRECISION,
    COUNT(e.fulfillment_score)::BIGINT
  INTO v_avg_fulfillment, v_fulfillment_count
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.fulfillment_score IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date);

  -- =========================================================================
  -- 3. Plan rate
  -- =========================================================================
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE origin = 'planned')::BIGINT
  INTO v_total_entries, v_planned_entries
  FROM public.entries
  WHERE user_id = p_user_id
    AND (p_start_date IS NULL OR start_time >= p_start_date)
    AND (p_end_date IS NULL OR start_time < p_end_date);

  -- =========================================================================
  -- 4. Context switches (TZ-aware, primary-tag per entry)
  -- =========================================================================
  WITH entry_primary_tag AS (
    SELECT DISTINCT ON (e.id)
      e.id,
      e.start_time,
      (e.start_time AT TIME ZONE v_tz)::DATE AS entry_date,
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
  INTO v_total_switches, v_switch_days
  FROM daily_switches;

  -- =========================================================================
  -- 5. Blank rate
  -- =========================================================================
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_days := GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400);
  ELSE
    v_days := 7;
  END IF;

  IF p_sleep_hour <= p_wake_hour THEN
    v_available_minutes := (24 - p_wake_hour + p_sleep_hour) * 60 * v_days;
  ELSE
    v_available_minutes := (p_sleep_hour - p_wake_hour) * 60 * v_days;
  END IF;

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

  -- =========================================================================
  -- Return unified JSON
  -- =========================================================================
  RETURN json_build_object(
    'cumulativeTime', json_build_object(
      'totalMinutes', v_total_minutes
    ),
    'avgFulfillment', json_build_object(
      'avgFulfillment', v_avg_fulfillment,
      'entryCount', v_fulfillment_count
    ),
    'planRate', json_build_object(
      'totalEntries', v_total_entries,
      'plannedEntries', v_planned_entries,
      'planRate', CASE WHEN v_total_entries > 0
        THEN (v_planned_entries::DOUBLE PRECISION / v_total_entries)
        ELSE 0 END
    ),
    'contextSwitches', json_build_object(
      'totalSwitches', v_total_switches,
      'avgPerDay', CASE WHEN v_switch_days > 0
        THEN (v_total_switches::DOUBLE PRECISION / v_switch_days)
        ELSE 0 END
    ),
    'blankRate', json_build_object(
      'availableMinutes', v_available_minutes,
      'scheduledMinutes', v_scheduled_minutes,
      'blankMinutes', v_blank_minutes,
      'blankRate', CASE WHEN v_available_minutes > 0
        THEN (v_blank_minutes::DOUBLE PRECISION / v_available_minutes)
        ELSE 0 END
    )
  );
END;
$$;

-- Security: revoke public, grant to authenticated only
REVOKE ALL ON FUNCTION public.get_stats_kpi_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stats_kpi_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;
