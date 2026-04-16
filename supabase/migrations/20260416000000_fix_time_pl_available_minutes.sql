-- Fix: 可処分時間の off-by-one エラーを修正
--
-- DATE_PART('day', end - start) は exclusive な日数差を返すため、
-- inclusive range（当日を含む）には +1 が必要。
-- 例: 同日 = 0 → 1, 週 = 6 → 7, 年 = 364 → 365

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
  -- 現在期間のエントリ
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

  -- 前期間のエントリ（オプション）
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

  -- ===== 1. タグ別 budget / actual =====
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
      JOIN public.entry_tags et ON et.entry_id = b.id AND et.user_id = b.user_id
      JOIN public.tags t ON t.id = et.tag_id
      GROUP BY t.id, t.name, t.color, t.icon
      HAVING SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time))) > 0
         OR SUM(CASE WHEN b.origin = 'planned' THEN b.duration_minutes ELSE 0 END) > 0
    ) sub
  ),

  -- ===== 2. 前期間のタグ別 budget / actual =====
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
      JOIN public.entry_tags et ON et.entry_id = p.id AND et.user_id = p.user_id
      JOIN public.tags t ON t.id = et.tag_id
      GROUP BY t.id, t.name, t.color, t.icon
      HAVING SUM(EXTRACT(EPOCH FROM (p.end_time - p.start_time))) > 0
         OR SUM(CASE WHEN p.origin = 'planned' THEN p.duration_minutes ELSE 0 END) > 0
    ) sub
  ),

  -- ===== 3. 日次ポイント（BreakEven用） =====
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

  -- ===== 4. 可処分時間 =====
  available AS (
    SELECT
      (p_sleep_hour - p_wake_hour) * 60 *
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
