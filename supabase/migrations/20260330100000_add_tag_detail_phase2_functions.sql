-- Tag Detail Stats Functions — Phase 2
-- 充実度分布・精度トレンド・直近ブロック

-- =============================================================================
-- 1. get_tag_fulfillment_distribution: タグ別の充実度スコア分布
-- =============================================================================

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
    JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
    WHERE e.user_id = p_user_id
      AND et.tag_id = p_tag_id
      AND e.deleted_at IS NULL
      AND e.fulfillment_score IS NOT NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time < p_end_date)
    GROUP BY e.fulfillment_score
    ORDER BY e.fulfillment_score DESC;
END;
$$;

-- =============================================================================
-- 2. get_tag_accuracy_trend: タグ別の見積もり精度推移（週/月バケット）
-- =============================================================================

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
    JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
    WHERE e.user_id = p_user_id
      AND et.tag_id = p_tag_id
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

-- =============================================================================
-- 3. get_tag_recent_entries: タグの直近エントリ一覧
-- =============================================================================

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
    JOIN public.entry_tags et ON et.entry_id = e.id AND et.user_id = e.user_id
    WHERE e.user_id = p_user_id
      AND et.tag_id = p_tag_id
      AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
    ORDER BY e.start_time DESC
    LIMIT p_limit;
END;
$$;
