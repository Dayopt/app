-- entry_tags 中間テーブル廃止 → entries.tag_id FK に統合
--
-- entry_tags は UNIQUE(entry_id) で 1:1 を強制していた。
-- 中間テーブルは不要なので entries.tag_id に直接格納する。

-- =============================================================================
-- 1. entries に tag_id カラム追加 + データ移行
-- =============================================================================

ALTER TABLE public.entries ADD COLUMN tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL;

UPDATE public.entries e
SET tag_id = et.tag_id
FROM public.entry_tags et
WHERE et.entry_id = e.id;

CREATE INDEX idx_entries_tag_id ON public.entries(tag_id) WHERE tag_id IS NOT NULL;

-- =============================================================================
-- 2. RPC関数を書き換え（JOIN entry_tags 削除）
-- =============================================================================

-- 2a. get_tag_cumulative_time
CREATE OR REPLACE FUNCTION public.get_tag_cumulative_time(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
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
    AND e.tag_id = p_tag_id
    AND e.deleted_at IS NULL
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date);

  RETURN json_build_object(
    'totalMinutes', v_total_minutes
  );
END;
$$;

-- 2b. get_tag_avg_fulfillment
CREATE OR REPLACE FUNCTION public.get_tag_avg_fulfillment(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
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
    AND e.tag_id = p_tag_id
    AND e.deleted_at IS NULL
    AND e.fulfillment_score IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date);

  RETURN json_build_object(
    'avgFulfillment', v_avg,
    'entryCount', v_count
  );
END;
$$;

-- 2c. get_tag_plan_rate
CREATE OR REPLACE FUNCTION public.get_tag_plan_rate(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_total BIGINT;
  v_planned BIGINT;
BEGIN
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE e.origin = 'planned')::BIGINT
  INTO v_total, v_planned
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.tag_id = p_tag_id
    AND e.deleted_at IS NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date);

  RETURN json_build_object(
    'totalEntries', v_total,
    'plannedEntries', v_planned,
    'planRate', CASE WHEN v_total > 0 THEN (v_planned::DOUBLE PRECISION / v_total) ELSE 0 END
  );
END;
$$;

-- 2d. get_tag_hourly_distribution
CREATE OR REPLACE FUNCTION public.get_tag_hourly_distribution(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(hour INT, total_minutes NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  RETURN QUERY
    SELECT
      EXTRACT(HOUR FROM e.start_time AT TIME ZONE v_tz)::INT,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
      )::NUMERIC, 1)
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.deleted_at IS NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time <= p_end_date)
    GROUP BY EXTRACT(HOUR FROM e.start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1;
END;
$$;

-- 2e. get_tag_dow_distribution
CREATE OR REPLACE FUNCTION public.get_tag_dow_distribution(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(dow INT, total_minutes NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  RETURN QUERY
    SELECT
      EXTRACT(DOW FROM e.start_time AT TIME ZONE v_tz)::INT,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
      )::NUMERIC, 1)
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.deleted_at IS NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time <= p_end_date)
    GROUP BY EXTRACT(DOW FROM e.start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1;
END;
$$;

-- 2f. get_child_tag_breakdown
CREATE OR REPLACE FUNCTION public.get_child_tag_breakdown(
  p_user_id UUID,
  p_prefix TEXT,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(tag_id UUID, tag_name TEXT, tag_color TEXT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT
      t.id AS tag_id,
      t.name AS tag_name,
      COALESCE(t.color, 'indigo') AS tag_color,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
      ) / 60, 2)::DOUBLE PRECISION AS hours
    FROM public.entries e
    JOIN public.tags t ON t.id = e.tag_id
    WHERE e.user_id = p_user_id
      AND t.name LIKE p_prefix || ':%'
      AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time < p_end_date)
    GROUP BY t.id, t.name, t.color
    ORDER BY hours DESC;
END;
$$;

-- 2g. get_tag_fulfillment_distribution
CREATE OR REPLACE FUNCTION public.get_tag_fulfillment_distribution(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(score INT, count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT
      e.fulfillment_score::INT AS score,
      COUNT(*)::BIGINT AS count
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.deleted_at IS NULL
      AND e.fulfillment_score IS NOT NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time < p_end_date)
    GROUP BY e.fulfillment_score
    ORDER BY e.fulfillment_score DESC;
END;
$$;

-- 2h. get_tag_accuracy_trend
CREATE OR REPLACE FUNCTION public.get_tag_accuracy_trend(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_bucket TEXT DEFAULT 'week'
)
RETURNS TABLE(bucket TEXT, avg_deviation DOUBLE PRECISION, entry_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  RETURN QUERY
    SELECT
      CASE p_bucket
        WHEN 'week' THEN 'W' || EXTRACT(WEEK FROM e.start_time AT TIME ZONE v_tz)::TEXT
        WHEN 'month' THEN TO_CHAR(e.start_time AT TIME ZONE v_tz, 'YYYY-MM')
        ELSE TO_CHAR(e.start_time AT TIME ZONE v_tz, 'YYYY-MM-DD')
      END AS bucket,
      AVG(
        ABS(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60 - e.duration_minutes)
      )::DOUBLE PRECISION AS avg_deviation,
      COUNT(*)::BIGINT AS entry_count
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.deleted_at IS NULL
      AND e.origin = 'planned'
      AND e.duration_minutes IS NOT NULL
      AND e.duration_minutes > 0
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time < p_end_date)
    GROUP BY bucket
    ORDER BY MIN(e.start_time);
END;
$$;

-- 2i. get_tag_recent_entries
CREATE OR REPLACE FUNCTION public.get_tag_recent_entries(
  p_user_id UUID,
  p_tag_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  entry_id UUID,
  title TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes DOUBLE PRECISION,
  planned_minutes DOUBLE PRECISION,
  fulfillment_score INT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT
      e.id AS entry_id,
      e.title::TEXT,
      e.start_time,
      e.end_time,
      EXTRACT(EPOCH FROM (e.end_time - e.start_time))::DOUBLE PRECISION / 60 AS duration_minutes,
      e.duration_minutes::DOUBLE PRECISION AS planned_minutes,
      e.fulfillment_score::INT
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
    ORDER BY e.start_time DESC
    LIMIT p_limit;
END;
$$;

-- 2j. get_estimation_accuracy
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
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

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
  JOIN public.tags t ON t.id = e.tag_id
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

-- 2k. get_context_switches
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
  v_tz TEXT;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT COALESCE(us.timezone, 'Asia/Tokyo')
  INTO v_tz
  FROM public.user_settings us
  WHERE us.user_id = p_user_id;

  IF v_tz IS NULL THEN
    v_tz := 'Asia/Tokyo';
  END IF;

  WITH entry_primary_tag AS (
    SELECT
      e.id,
      e.start_time,
      (e.start_time AT TIME ZONE v_tz)::DATE AS entry_date,
      e.tag_id
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.start_time IS NOT NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time < p_end_date)
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
  INTO v_total_switches, v_days
  FROM daily_switches;

  RETURN json_build_object(
    'totalSwitches', v_total_switches,
    'avgPerDay', CASE WHEN v_days > 0 THEN (v_total_switches::DOUBLE PRECISION / v_days) ELSE 0 END
  );
END;
$$;

-- 2l. get_time_by_tag
CREATE OR REPLACE FUNCTION public.get_time_by_tag(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  tag_id UUID,
  tag_name TEXT,
  tag_color TEXT,
  hours DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT
    t.id AS tag_id,
    t.name AS tag_name,
    COALESCE(t.color, 'indigo') AS tag_color,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600.0
    ), 0) AS hours
  FROM public.entries e
  JOIN public.tags t ON t.id = e.tag_id
  WHERE e.user_id = p_user_id
    AND e.tag_id IS NOT NULL
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL
    AND e.end_time > e.start_time
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time <= p_end_date)
  GROUP BY t.id, t.name, t.color
  HAVING SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time))) > 0
  ORDER BY hours DESC;
END;
$$;

-- 2m. get_tag_stats
CREATE OR REPLACE FUNCTION public.get_tag_stats(p_user_id UUID)
RETURNS TABLE(tag_id UUID, entry_count BIGINT, last_used TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT e.tag_id, COUNT(*)::BIGINT, MAX(e.created_at)
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.tag_id IS NOT NULL
  GROUP BY e.tag_id;
END;
$$;

-- 2n. merge_tags
CREATE OR REPLACE FUNCTION public.merge_tags(
  p_user_id UUID,
  p_source_tag_id UUID,
  p_target_tag_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_migrated INTEGER := 0;
BEGIN
  -- entries の tag_id を source → target に更新
  -- 既に target タグが付いている entry は変更しない（重複回避）
  UPDATE public.entries
  SET tag_id = p_target_tag_id
  WHERE user_id = p_user_id
    AND tag_id = p_source_tag_id
    AND id NOT IN (
      SELECT id FROM public.entries
      WHERE user_id = p_user_id AND tag_id = p_target_tag_id
    );

  GET DIAGNOSTICS v_migrated = ROW_COUNT;

  -- source タグが残っている entries はタグを外す（重複していた分）
  UPDATE public.entries
  SET tag_id = NULL
  WHERE user_id = p_user_id
    AND tag_id = p_source_tag_id;

  -- source タグを非アクティブに
  UPDATE public.tags
  SET is_active = false
  WHERE id = p_source_tag_id AND user_id = p_user_id;

  RETURN json_build_object('migrated', v_migrated);
END;
$$;

-- 2o. get_weekly_focus_score
CREATE OR REPLACE FUNCTION public.get_weekly_focus_score(p_user_id UUID, p_weeks INT DEFAULT 12)
RETURNS TABLE(week_start TEXT, focus_score DOUBLE PRECISION, entry_count BIGINT, unique_tags BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(date_trunc('week', e.start_time AT TIME ZONE 'UTC'), 'YYYY-MM-DD'),
    CASE
      WHEN COUNT(DISTINCT e.tag_id) = 0 THEN 0
      ELSE (1.0 / COUNT(DISTINCT e.tag_id)::DOUBLE PRECISION) * 100
    END,
    COUNT(DISTINCT e.id)::BIGINT,
    COUNT(DISTINCT e.tag_id)::BIGINT
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.start_time >= (now() - (p_weeks || ' weeks')::interval)
    AND e.start_time IS NOT NULL
  GROUP BY date_trunc('week', e.start_time AT TIME ZONE 'UTC')
  ORDER BY 1;
END;
$$;

-- 2p. get_stats_kpi_summary
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
  v_total_minutes DOUBLE PRECISION;
  v_avg_fulfillment DOUBLE PRECISION;
  v_fulfillment_count BIGINT;
  v_total_entries BIGINT;
  v_planned_entries BIGINT;
  v_total_switches BIGINT;
  v_switch_days BIGINT;
  v_days INTEGER;
  v_available_minutes INTEGER;
  v_scheduled_minutes BIGINT;
  v_blank_minutes INTEGER;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT COALESCE(us.timezone, 'Asia/Tokyo')
  INTO v_tz
  FROM public.user_settings us
  WHERE us.user_id = p_user_id;

  IF v_tz IS NULL THEN
    v_tz := 'Asia/Tokyo';
  END IF;

  -- 1. Cumulative time
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60), 0)
  INTO v_total_minutes
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date);

  -- 2. Average fulfillment
  SELECT AVG(e.fulfillment_score)::DOUBLE PRECISION, COUNT(e.fulfillment_score)::BIGINT
  INTO v_avg_fulfillment, v_fulfillment_count
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.fulfillment_score IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date);

  -- 3. Plan rate
  SELECT COUNT(*)::BIGINT, COUNT(*) FILTER (WHERE origin = 'planned')::BIGINT
  INTO v_total_entries, v_planned_entries
  FROM public.entries
  WHERE user_id = p_user_id
    AND (p_start_date IS NULL OR start_time >= p_start_date)
    AND (p_end_date IS NULL OR start_time < p_end_date);

  -- 4. Context switches (entries.tag_id directly)
  WITH entry_primary_tag AS (
    SELECT e.id, e.start_time,
      (e.start_time AT TIME ZONE v_tz)::DATE AS entry_date,
      e.tag_id
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.start_time IS NOT NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time < p_end_date)
  ),
  ordered_entries AS (
    SELECT entry_date, tag_id,
      LAG(tag_id) OVER (PARTITION BY entry_date ORDER BY start_time) AS prev_tag_id
    FROM entry_primary_tag
  ),
  daily_switches AS (
    SELECT entry_date,
      COUNT(*) FILTER (WHERE prev_tag_id IS NOT NULL AND tag_id IS DISTINCT FROM prev_tag_id)::BIGINT AS switches
    FROM ordered_entries
    GROUP BY entry_date
  )
  SELECT COALESCE(SUM(switches), 0)::BIGINT, GREATEST(COUNT(DISTINCT entry_date), 1)::BIGINT
  INTO v_total_switches, v_switch_days
  FROM daily_switches;

  -- 5. Blank rate
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
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60), 0)::BIGINT
  INTO v_scheduled_minutes
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date);
  v_blank_minutes := GREATEST(0, v_available_minutes - v_scheduled_minutes);

  RETURN json_build_object(
    'cumulativeTime', json_build_object('totalMinutes', v_total_minutes),
    'avgFulfillment', json_build_object('avgFulfillment', v_avg_fulfillment, 'entryCount', v_fulfillment_count),
    'planRate', json_build_object(
      'totalEntries', v_total_entries, 'plannedEntries', v_planned_entries,
      'planRate', CASE WHEN v_total_entries > 0 THEN (v_planned_entries::DOUBLE PRECISION / v_total_entries) ELSE 0 END
    ),
    'contextSwitches', json_build_object(
      'totalSwitches', v_total_switches,
      'avgPerDay', CASE WHEN v_switch_days > 0 THEN (v_total_switches::DOUBLE PRECISION / v_switch_days) ELSE 0 END
    ),
    'blankRate', json_build_object(
      'availableMinutes', v_available_minutes, 'scheduledMinutes', v_scheduled_minutes,
      'blankMinutes', v_blank_minutes,
      'blankRate', CASE WHEN v_available_minutes > 0 THEN (v_blank_minutes::DOUBLE PRECISION / v_available_minutes) ELSE 0 END
    )
  );
END;
$$;

-- 2q. get_time_pl_data
CREATE OR REPLACE FUNCTION public.get_time_pl_data(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_prev_start TIMESTAMPTZ DEFAULT NULL,
  p_prev_end TIMESTAMPTZ DEFAULT NULL,
  p_wake_hour INT DEFAULT 7,
  p_sleep_hour INT DEFAULT 23
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT;
  v_result JSON;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  WITH
  base AS (
    SELECT e.* FROM public.entries e
    WHERE e.user_id = p_user_id AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL
      AND e.start_time >= p_start_date AND e.start_time < p_end_date
  ),
  prev AS (
    SELECT e.* FROM public.entries e
    WHERE e.user_id = p_user_id AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL
      AND p_prev_start IS NOT NULL AND p_prev_end IS NOT NULL
      AND e.start_time >= p_prev_start AND e.start_time < p_prev_end
  ),
  tag_pl AS (
    SELECT COALESCE(json_agg(row_data ORDER BY total_actual DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id, 'tagName', t.name, 'tagColor', COALESCE(t.color, 'indigo'), 'tagIcon', t.icon,
        'budgetMinutes', ROUND(COALESCE(SUM(
          CASE WHEN b.origin = 'planned' AND b.duration_minutes IS NOT NULL AND b.duration_minutes > 0
               THEN b.duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1),
        'actualMinutes', ROUND(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::NUMERIC, 1),
        'isPlanned', BOOL_OR(b.origin = 'planned' AND b.duration_minutes IS NOT NULL AND b.duration_minutes > 0)
      ) AS row_data,
      SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60) AS total_actual
      FROM base b
      JOIN public.tags t ON t.id = b.tag_id
      WHERE b.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color, t.icon
      HAVING SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time))) > 0
         OR SUM(CASE WHEN b.origin = 'planned' THEN b.duration_minutes ELSE 0 END) > 0
    ) sub
  ),
  prev_tag_pl AS (
    SELECT COALESCE(json_agg(row_data ORDER BY total_actual DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id, 'tagName', t.name, 'tagColor', COALESCE(t.color, 'indigo'), 'tagIcon', t.icon,
        'budgetMinutes', ROUND(COALESCE(SUM(
          CASE WHEN p.origin = 'planned' AND p.duration_minutes IS NOT NULL AND p.duration_minutes > 0
               THEN p.duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1),
        'actualMinutes', ROUND(SUM(EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 60)::NUMERIC, 1),
        'isPlanned', BOOL_OR(p.origin = 'planned' AND p.duration_minutes IS NOT NULL AND p.duration_minutes > 0)
      ) AS row_data,
      SUM(EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 60) AS total_actual
      FROM prev p
      JOIN public.tags t ON t.id = p.tag_id
      WHERE p.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color, t.icon
      HAVING SUM(EXTRACT(EPOCH FROM (p.end_time - p.start_time))) > 0
         OR SUM(CASE WHEN p.origin = 'planned' THEN p.duration_minutes ELSE 0 END) > 0
    ) sub
  ),
  daily_points AS (
    SELECT COALESCE(json_agg(json_build_object(
      'label', TO_CHAR(day, 'MM/DD'),
      'budgetMinutes', COALESCE(budget_min, 0),
      'actualMinutes', COALESCE(actual_min, 0)
    ) ORDER BY day), '[]'::JSON) AS data
    FROM (
      SELECT
        (b.start_time AT TIME ZONE v_tz)::DATE AS day,
        ROUND(COALESCE(SUM(
          CASE WHEN b.origin = 'planned' AND b.duration_minutes IS NOT NULL AND b.duration_minutes > 0
               THEN b.duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1) AS budget_min,
        ROUND(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::NUMERIC, 1) AS actual_min
      FROM base b
      GROUP BY (b.start_time AT TIME ZONE v_tz)::DATE
    ) sub
  ),
  available AS (
    SELECT (p_sleep_hour - p_wake_hour) * 60 *
      (DATE_PART('day', (p_end_date AT TIME ZONE v_tz)::DATE - (p_start_date AT TIME ZONE v_tz)::DATE)::INT) AS minutes
  )

  SELECT json_build_object(
    'tags', tag_pl.data,
    'prevTags', prev_tag_pl.data,
    'dailyPoints', daily_points.data,
    'availableMinutes', GREATEST(available.minutes, 0)
  ) INTO v_result
  FROM tag_pl, prev_tag_pl, daily_points, available;

  RETURN v_result;
END;
$$;

-- 2r. get_stats_page_data
CREATE OR REPLACE FUNCTION public.get_stats_page_data(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_prev_start TIMESTAMPTZ,
  p_prev_end TIMESTAMPTZ,
  p_year INT,
  p_monthly_months INT DEFAULT 3,
  p_wake_hour INT DEFAULT 7,
  p_sleep_hour INT DEFAULT 23
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
  v_result JSON;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  WITH
  base AS (
    SELECT e.* FROM public.entries e
    WHERE e.user_id = p_user_id AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL
      AND e.start_time >= p_start_date AND e.start_time < p_end_date
  ),
  prev AS (
    SELECT e.* FROM public.entries e
    WHERE e.user_id = p_user_id AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL
      AND e.start_time >= p_prev_start AND e.start_time < p_prev_end
  ),
  overview AS (
    SELECT json_build_object(
      'totalMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60), 0),
      'avgFulfillment', AVG(b.fulfillment_score),
      'entryCount', COUNT(b.fulfillment_score) FILTER (WHERE b.fulfillment_score IS NOT NULL),
      'totalEntries', COUNT(*),
      'plannedEntries', COUNT(*) FILTER (WHERE b.origin = 'planned'),
      'planRate', CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE b.origin = 'planned')::DOUBLE PRECISION / COUNT(*) ELSE 0 END
    ) AS data FROM base b
  ),
  prev_overview AS (
    SELECT json_build_object(
      'totalMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 60), 0),
      'avgFulfillment', AVG(p.fulfillment_score),
      'entryCount', COUNT(p.fulfillment_score) FILTER (WHERE p.fulfillment_score IS NOT NULL),
      'totalEntries', COUNT(*),
      'plannedEntries', COUNT(*) FILTER (WHERE p.origin = 'planned'),
      'planRate', CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE p.origin = 'planned')::DOUBLE PRECISION / COUNT(*) ELSE 0 END
    ) AS data FROM prev p
  ),
  cs_tags AS (
    SELECT b.id, b.start_time,
      (b.start_time AT TIME ZONE v_tz)::DATE AS entry_date, b.tag_id
    FROM base b
  ),
  cs_ordered AS (
    SELECT entry_date, tag_id,
      LAG(tag_id) OVER (PARTITION BY entry_date ORDER BY start_time) AS prev_tag_id
    FROM cs_tags
  ),
  cs_daily AS (
    SELECT entry_date,
      COUNT(*) FILTER (WHERE prev_tag_id IS NOT NULL AND tag_id IS DISTINCT FROM prev_tag_id) AS switches
    FROM cs_ordered GROUP BY entry_date
  ),
  context_switches AS (
    SELECT json_build_object(
      'totalSwitches', COALESCE(SUM(switches), 0),
      'avgPerDay', CASE WHEN COUNT(DISTINCT entry_date) > 0
        THEN COALESCE(SUM(switches), 0)::DOUBLE PRECISION / COUNT(DISTINCT entry_date) ELSE 0 END
    ) AS data FROM cs_daily
  ),
  blank_rate AS (
    SELECT json_build_object(
      'availableMinutes', CASE
        WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
        ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT END,
      'scheduledMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60), 0),
      'blankRate', CASE
        WHEN CASE
          WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
          ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT END > 0 THEN
          GREATEST(0,
            CASE
              WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
              ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT END
            - COALESCE(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60), 0)
          )::DOUBLE PRECISION / CASE
            WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
            ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT END
        ELSE 0 END
    ) AS data FROM base b
  ),
  time_by_tag AS (
    SELECT COALESCE(json_agg(row_data ORDER BY hours DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id, 'name', t.name, 'color', COALESCE(t.color, 'indigo'),
        'hours', ROUND(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600)::NUMERIC, 2)
      ) AS row_data,
      SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600) AS hours
      FROM base b
      JOIN public.tags t ON t.id = b.tag_id
      WHERE b.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color
      HAVING SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time))) > 0
    ) sub
  ),
  hourly AS (
    SELECT COALESCE(json_agg(json_build_object('hour', hour, 'totalMinutes', total_minutes) ORDER BY hour), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(HOUR FROM b.start_time AT TIME ZONE v_tz)::INT AS hour,
        ROUND(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::NUMERIC, 1) AS total_minutes
      FROM base b GROUP BY EXTRACT(HOUR FROM b.start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  dow AS (
    SELECT COALESCE(json_agg(json_build_object('dow', dow, 'totalMinutes', total_minutes) ORDER BY dow), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(DOW FROM b.start_time AT TIME ZONE v_tz)::INT AS dow,
        ROUND(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::NUMERIC, 1) AS total_minutes
      FROM base b GROUP BY EXTRACT(DOW FROM b.start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  energy_map AS (
    SELECT COALESCE(json_agg(json_build_object(
      'hour', hour, 'dow', dow, 'avgFulfillment', avg_fulfillment,
      'totalMinutes', total_minutes, 'entryCount', entry_count
    ) ORDER BY hour, dow), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(HOUR FROM b.start_time AT TIME ZONE v_tz)::INT AS hour,
        EXTRACT(DOW FROM b.start_time AT TIME ZONE v_tz)::INT AS dow,
        AVG(b.fulfillment_score)::DOUBLE PRECISION AS avg_fulfillment,
        SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::DOUBLE PRECISION AS total_minutes,
        COUNT(*)::BIGINT AS entry_count
      FROM base b GROUP BY
        EXTRACT(HOUR FROM b.start_time AT TIME ZONE v_tz)::INT,
        EXTRACT(DOW FROM b.start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  estimation_accuracy AS (
    SELECT COALESCE(json_agg(row_data ORDER BY entry_count DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id, 'tagName', t.name, 'tagColor', COALESCE(t.color, 'indigo'),
        'avgPlannedMinutes', AVG(b.duration_minutes),
        'avgActualMinutes', AVG(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60),
        'avgDeviationMinutes', AVG(ABS(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60 - b.duration_minutes)),
        'entryCount', COUNT(*)
      ) AS row_data, COUNT(*) AS entry_count
      FROM base b
      JOIN public.tags t ON t.id = b.tag_id
      WHERE b.tag_id IS NOT NULL AND b.origin = 'planned'
        AND b.duration_minutes IS NOT NULL AND b.duration_minutes > 0
      GROUP BY t.id, t.name, t.color HAVING COUNT(*) >= 2
    ) sub
  ),
  prev_estimation_accuracy AS (
    SELECT COALESCE(json_agg(row_data ORDER BY entry_count DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id, 'tagName', t.name, 'tagColor', COALESCE(t.color, 'indigo'),
        'avgPlannedMinutes', AVG(p.duration_minutes),
        'avgActualMinutes', AVG(EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 60),
        'avgDeviationMinutes', AVG(ABS(EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 60 - p.duration_minutes)),
        'entryCount', COUNT(*)
      ) AS row_data, COUNT(*) AS entry_count
      FROM prev p
      JOIN public.tags t ON t.id = p.tag_id
      WHERE p.tag_id IS NOT NULL AND p.origin = 'planned'
        AND p.duration_minutes IS NOT NULL AND p.duration_minutes > 0
      GROUP BY t.id, t.name, t.color HAVING COUNT(*) >= 2
    ) sub
  ),
  prev_energy_map AS (
    SELECT COALESCE(json_agg(json_build_object(
      'hour', hour, 'dow', dow, 'avgFulfillment', avg_fulfillment,
      'totalMinutes', total_minutes, 'entryCount', entry_count
    ) ORDER BY hour, dow), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(HOUR FROM p.start_time AT TIME ZONE v_tz)::INT AS hour,
        EXTRACT(DOW FROM p.start_time AT TIME ZONE v_tz)::INT AS dow,
        AVG(p.fulfillment_score)::DOUBLE PRECISION AS avg_fulfillment,
        SUM(EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 60)::DOUBLE PRECISION AS total_minutes,
        COUNT(*)::BIGINT AS entry_count
      FROM prev p GROUP BY
        EXTRACT(HOUR FROM p.start_time AT TIME ZONE v_tz)::INT,
        EXTRACT(DOW FROM p.start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  daily_hours AS (
    SELECT COALESCE(json_agg(json_build_object('day', day, 'hours', hours) ORDER BY day), '[]'::JSON) AS data
    FROM (
      SELECT to_char((e.start_time AT TIME ZONE v_tz)::DATE, 'YYYY-MM-DD') AS day,
        ROUND(SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600)::NUMERIC, 2) AS hours
      FROM public.entries e
      WHERE e.user_id = p_user_id AND e.deleted_at IS NULL
        AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL
        AND EXTRACT(YEAR FROM e.start_time AT TIME ZONE v_tz) = p_year
      GROUP BY (e.start_time AT TIME ZONE v_tz)::DATE
    ) sub
  ),
  monthly_trend AS (
    SELECT COALESCE(json_agg(json_build_object('month', month, 'hours', hours) ORDER BY month), '[]'::JSON) AS data
    FROM (
      SELECT to_char(date_trunc('month', e.start_time AT TIME ZONE v_tz), 'YYYY-MM') AS month,
        ROUND(SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600)::NUMERIC, 2) AS hours
      FROM public.entries e
      WHERE e.user_id = p_user_id AND e.deleted_at IS NULL
        AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL
        AND e.start_time >= (date_trunc('month', NOW() AT TIME ZONE v_tz) - (p_monthly_months || ' months')::INTERVAL) AT TIME ZONE v_tz
      GROUP BY date_trunc('month', e.start_time AT TIME ZONE v_tz)
    ) sub
  )

  SELECT json_build_object(
    'overview', o.data, 'prevOverview', po.data,
    'contextSwitches', cs.data, 'blankRate', br.data,
    'timeByTag', tbt.data, 'hourly', h.data, 'dow', d.data,
    'energyMap', em.data, 'estimationAccuracy', ea.data,
    'prevEstimationAccuracy', pea.data, 'prevEnergyMap', pem.data,
    'dailyHours', dh.data, 'monthlyTrend', mt.data
  ) INTO v_result
  FROM overview o, prev_overview po, context_switches cs, blank_rate br,
       time_by_tag tbt, hourly h, dow d, energy_map em,
       estimation_accuracy ea, prev_estimation_accuracy pea,
       prev_energy_map pem, daily_hours dh, monthly_trend mt;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 3. entry_tags テーブルを DROP
-- =============================================================================

DROP TABLE IF EXISTS public.entry_tags CASCADE;
