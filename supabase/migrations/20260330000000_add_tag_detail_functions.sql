-- Tag Detail Stats Functions
-- タグ詳細ページ用の DB 関数群
-- tRPC tag-statistics router から呼び出される

-- =============================================================================
-- 1. get_tag_cumulative_time: タグ別の合計記録時間
-- =============================================================================

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
  JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
  WHERE e.user_id = p_user_id
    AND et.tag_id = p_tag_id
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

-- =============================================================================
-- 2. get_tag_avg_fulfillment: タグ別の平均充実度
-- =============================================================================

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
  JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
  WHERE e.user_id = p_user_id
    AND et.tag_id = p_tag_id
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

-- =============================================================================
-- 3. get_tag_plan_rate: タグ別の計画率
-- =============================================================================

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
  JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
  WHERE e.user_id = p_user_id
    AND et.tag_id = p_tag_id
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

-- =============================================================================
-- 4. get_tag_hourly_distribution: タグ別の時間帯分布
-- =============================================================================

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
    JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
    WHERE e.user_id = p_user_id
      AND et.tag_id = p_tag_id
      AND e.deleted_at IS NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time <= p_end_date)
    GROUP BY EXTRACT(HOUR FROM e.start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1;
END;
$$;

-- =============================================================================
-- 5. get_tag_dow_distribution: タグ別の曜日分布
-- =============================================================================

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
    JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
    WHERE e.user_id = p_user_id
      AND et.tag_id = p_tag_id
      AND e.deleted_at IS NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time <= p_end_date)
    GROUP BY EXTRACT(DOW FROM e.start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1;
END;
$$;

-- =============================================================================
-- 6. get_child_tag_breakdown: コロン記法による子タグ内訳
-- =============================================================================

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
    JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
    JOIN public.tags t ON t.id = et.tag_id
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
