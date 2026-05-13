-- Entry two-layer time model:
-- - planned entries have planned and actual ranges
-- - unplanned entries have actual range only
-- - planned overlap and actual overlap are constrained independently

CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;

-- Backfill planned actual ranges from planned ranges.
UPDATE public.entries
SET
  actual_start_time = COALESCE(actual_start_time, start_time),
  actual_end_time = COALESCE(actual_end_time, end_time)
WHERE deleted_at IS NULL
  AND origin = 'planned'
  AND start_time IS NOT NULL
  AND end_time IS NOT NULL
  AND (actual_start_time IS NULL OR actual_end_time IS NULL);

-- Backfill existing unplanned rows from their old display range, then remove
-- planned range. Rows without any usable range are left for NOT VALID shape
-- validation cleanup, while new rows are enforced immediately.
UPDATE public.entries
SET
  actual_start_time = COALESCE(actual_start_time, start_time),
  actual_end_time = COALESCE(actual_end_time, end_time)
WHERE deleted_at IS NULL
  AND origin = 'unplanned'
  AND (actual_start_time IS NULL OR actual_end_time IS NULL);

UPDATE public.entries
SET
  start_time = NULL,
  end_time = NULL
WHERE deleted_at IS NULL
  AND origin = 'unplanned'
  AND actual_start_time IS NOT NULL
  AND actual_end_time IS NOT NULL;

-- Remove existing active overlaps before recreating exclusion constraints.
WITH planned_overlap_pairs AS (
  SELECT e2.id AS delete_id
  FROM public.entries e1
  JOIN public.entries e2
    ON e1.user_id = e2.user_id
   AND e1.id < e2.id
   AND e1.deleted_at IS NULL
   AND e2.deleted_at IS NULL
   AND e1.start_time IS NOT NULL AND e1.end_time IS NOT NULL
   AND e2.start_time IS NOT NULL AND e2.end_time IS NOT NULL
   AND tstzrange(e1.start_time, e1.end_time, '[)') && tstzrange(e2.start_time, e2.end_time, '[)')
)
UPDATE public.entries
SET deleted_at = NOW()
WHERE id IN (SELECT delete_id FROM planned_overlap_pairs)
  AND deleted_at IS NULL;

WITH actual_overlap_pairs AS (
  SELECT e2.id AS delete_id
  FROM public.entries e1
  JOIN public.entries e2
    ON e1.user_id = e2.user_id
   AND e1.id < e2.id
   AND e1.deleted_at IS NULL
   AND e2.deleted_at IS NULL
   AND e1.actual_start_time IS NOT NULL AND e1.actual_end_time IS NOT NULL
   AND e2.actual_start_time IS NOT NULL AND e2.actual_end_time IS NOT NULL
   AND tstzrange(e1.actual_start_time, e1.actual_end_time, '[)') && tstzrange(e2.actual_start_time, e2.actual_end_time, '[)')
)
UPDATE public.entries
SET deleted_at = NOW()
WHERE id IN (SELECT delete_id FROM actual_overlap_pairs)
  AND deleted_at IS NULL;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_no_time_overlap;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_no_planned_time_overlap;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_no_actual_time_overlap;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_planned_time_order;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_actual_time_order;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_two_layer_shape;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_no_planned_time_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (deleted_at IS NULL AND start_time IS NOT NULL AND end_time IS NOT NULL);

ALTER TABLE public.entries
  ADD CONSTRAINT entries_no_actual_time_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(actual_start_time, actual_end_time, '[)') WITH &&
  )
  WHERE (
    deleted_at IS NULL
    AND actual_start_time IS NOT NULL
    AND actual_end_time IS NOT NULL
  );

ALTER TABLE public.entries
  ADD CONSTRAINT entries_planned_time_order
  CHECK (deleted_at IS NOT NULL OR start_time IS NULL OR end_time IS NULL OR end_time > start_time) NOT VALID;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_actual_time_order
  CHECK (
    deleted_at IS NOT NULL
    OR (
      actual_start_time IS NOT NULL
      AND actual_end_time IS NOT NULL
      AND actual_end_time > actual_start_time
    )
  ) NOT VALID;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_two_layer_shape
  CHECK (
    deleted_at IS NOT NULL
    OR
    (
      origin = 'planned'
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND actual_start_time IS NOT NULL
      AND actual_end_time IS NOT NULL
    )
    OR
    (
      origin = 'unplanned'
      AND start_time IS NULL
      AND end_time IS NULL
      AND actual_start_time IS NOT NULL
      AND actual_end_time IS NOT NULL
    )
  ) NOT VALID;

-- Review Time P/L must treat planned minutes and actual minutes as separate
-- layers. Unplanned rows have 0 planned minutes and actual minutes from actual
-- range.
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
      AND e.actual_start_time IS NOT NULL
      AND e.actual_end_time IS NOT NULL
      AND e.actual_start_time < p_end_date
      AND e.actual_end_time > p_start_date
  ),

  prev AS (
    SELECT e.*
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND e.actual_start_time IS NOT NULL
      AND e.actual_end_time IS NOT NULL
      AND p_prev_start IS NOT NULL
      AND p_prev_end IS NOT NULL
      AND e.actual_start_time < p_prev_end
      AND e.actual_end_time > p_prev_start
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
          CASE WHEN b.origin = 'planned' AND b.duration_minutes IS NOT NULL
               THEN b.duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1),
        'actualMinutes', ROUND(SUM(EXTRACT(EPOCH FROM (b.actual_end_time - b.actual_start_time)) / 60)::NUMERIC, 1),
        'isPlanned', BOOL_OR(b.origin = 'planned' AND b.duration_minutes IS NOT NULL AND b.duration_minutes > 0)
      ) AS row_data,
      SUM(EXTRACT(EPOCH FROM (b.actual_end_time - b.actual_start_time)) / 60) AS total_actual
      FROM base b
      JOIN public.tags t ON t.id = b.tag_id
      WHERE b.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color, t.icon
      HAVING SUM(EXTRACT(EPOCH FROM (b.actual_end_time - b.actual_start_time))) > 0
         OR SUM(CASE WHEN b.origin = 'planned' THEN COALESCE(b.duration_minutes, 0) ELSE 0 END) > 0
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
          CASE WHEN p.origin = 'planned' AND p.duration_minutes IS NOT NULL
               THEN p.duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1),
        'actualMinutes', ROUND(SUM(EXTRACT(EPOCH FROM (p.actual_end_time - p.actual_start_time)) / 60)::NUMERIC, 1),
        'isPlanned', BOOL_OR(p.origin = 'planned' AND p.duration_minutes IS NOT NULL AND p.duration_minutes > 0)
      ) AS row_data,
      SUM(EXTRACT(EPOCH FROM (p.actual_end_time - p.actual_start_time)) / 60) AS total_actual
      FROM prev p
      JOIN public.tags t ON t.id = p.tag_id
      WHERE p.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color, t.icon
      HAVING SUM(EXTRACT(EPOCH FROM (p.actual_end_time - p.actual_start_time))) > 0
         OR SUM(CASE WHEN p.origin = 'planned' THEN COALESCE(p.duration_minutes, 0) ELSE 0 END) > 0
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
        (b.actual_start_time AT TIME ZONE v_tz)::DATE AS day,
        ROUND(COALESCE(SUM(
          CASE WHEN b.origin = 'planned' AND b.duration_minutes IS NOT NULL
               THEN b.duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1) AS budget_min,
        ROUND(SUM(EXTRACT(EPOCH FROM (b.actual_end_time - b.actual_start_time)) / 60)::NUMERIC, 1) AS actual_min
      FROM base b
      GROUP BY (b.actual_start_time AT TIME ZONE v_tz)::DATE
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
