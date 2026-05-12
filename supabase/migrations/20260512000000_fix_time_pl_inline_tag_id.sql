-- Fix get_time_pl_data after entry_tags was folded into entries.tag_id.
--
-- 20260415000000_inline_entry_tag_id.sql drops public.entry_tags, but
-- 20260416000000_fix_time_pl_available_minutes.sql recreated get_time_pl_data
-- with the old entry_tags join. That makes /review fail when Time P/L data is
-- requested. Recreate the function against entries.tag_id and keep the
-- available-minutes fix from 20260416000000.

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
    SELECT e.*
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
      AND e.start_time >= p_start_date
      AND e.start_time < p_end_date
  ),

  prev AS (
    SELECT e.*
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
      AND p_prev_start IS NOT NULL
      AND p_prev_end IS NOT NULL
      AND e.start_time >= p_prev_start
      AND e.start_time < p_prev_end
  ),

  tag_pl AS (
    SELECT COALESCE(json_agg(row_data ORDER BY total_actual DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id,
        'tagName', t.name,
        'tagColor', COALESCE(t.color, 'indigo'),
        'tagIcon', t.icon,
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
        'tagId', t.id,
        'tagName', t.name,
        'tagColor', COALESCE(t.color, 'indigo'),
        'tagIcon', t.icon,
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
    SELECT
      CASE
        WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60
        ELSE (p_sleep_hour - p_wake_hour) * 60
      END *
      (DATE_PART('day', (p_end_date AT TIME ZONE v_tz)::DATE - (p_start_date AT TIME ZONE v_tz)::DATE)::INT + 1)
      AS minutes
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

REVOKE ALL ON FUNCTION public.get_time_pl_data(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_time_pl_data(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO authenticated;
