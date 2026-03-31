-- =============================================================================
-- get_stats_page_data: Stats ページ全データを 1 RPC で返す統合クエリ
--
-- 従来 12 個の個別 RPC を CTE ベースで 1 関数に統合。
-- entries テーブルを current/prev 期間で 2 回スキャンし、全指標を計算。
-- =============================================================================

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
  -- ===== Base: 現在期間のエントリ =====
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

  -- ===== Prev: 前期間のエントリ =====
  prev AS (
    SELECT e.*
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
      AND e.start_time >= p_prev_start
      AND e.start_time < p_prev_end
  ),

  -- ===== 1. KPI Overview (current) =====
  overview AS (
    SELECT json_build_object(
      'totalMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60), 0),
      'avgFulfillment', AVG(b.fulfillment_score),
      'entryCount', COUNT(b.fulfillment_score) FILTER (WHERE b.fulfillment_score IS NOT NULL),
      'totalEntries', COUNT(*),
      'plannedEntries', COUNT(*) FILTER (WHERE b.origin = 'planned'),
      'planRate', CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE b.origin = 'planned')::DOUBLE PRECISION / COUNT(*)
        ELSE 0 END
    ) AS data
    FROM base b
  ),

  -- ===== 2. KPI Overview (previous) =====
  prev_overview AS (
    SELECT json_build_object(
      'totalMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 60), 0),
      'avgFulfillment', AVG(p.fulfillment_score),
      'entryCount', COUNT(p.fulfillment_score) FILTER (WHERE p.fulfillment_score IS NOT NULL),
      'totalEntries', COUNT(*),
      'plannedEntries', COUNT(*) FILTER (WHERE p.origin = 'planned'),
      'planRate', CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE p.origin = 'planned')::DOUBLE PRECISION / COUNT(*)
        ELSE 0 END
    ) AS data
    FROM prev p
  ),

  -- ===== 3. Context Switches (current) =====
  cs_tags AS (
    SELECT DISTINCT ON (b.id)
      b.id,
      b.start_time,
      (b.start_time AT TIME ZONE v_tz)::DATE AS entry_date,
      et.tag_id
    FROM base b
    LEFT JOIN public.entry_tags et ON et.entry_id = b.id AND et.user_id = b.user_id
    ORDER BY b.id, et.tag_id
  ),
  cs_ordered AS (
    SELECT
      entry_date,
      tag_id,
      LAG(tag_id) OVER (PARTITION BY entry_date ORDER BY start_time) AS prev_tag_id
    FROM cs_tags
  ),
  cs_daily AS (
    SELECT
      entry_date,
      COUNT(*) FILTER (WHERE prev_tag_id IS NOT NULL AND tag_id IS DISTINCT FROM prev_tag_id) AS switches
    FROM cs_ordered
    GROUP BY entry_date
  ),
  context_switches AS (
    SELECT json_build_object(
      'totalSwitches', COALESCE(SUM(switches), 0),
      'avgPerDay', CASE WHEN COUNT(DISTINCT entry_date) > 0
        THEN COALESCE(SUM(switches), 0)::DOUBLE PRECISION / COUNT(DISTINCT entry_date)
        ELSE 0 END
    ) AS data
    FROM cs_daily
  ),

  -- ===== 4. Blank Rate =====
  blank_rate AS (
    SELECT json_build_object(
      'availableMinutes', CASE
        WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
        ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
      END,
      'scheduledMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60), 0),
      'blankRate', CASE
        WHEN CASE
          WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
          ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
        END > 0 THEN
          GREATEST(0,
            CASE
              WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
              ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
            END - COALESCE(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60), 0)
          )::DOUBLE PRECISION / CASE
            WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
            ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
          END
        ELSE 0 END
    ) AS data
    FROM base b
  ),

  -- ===== 5. Time by Tag =====
  time_by_tag AS (
    SELECT COALESCE(json_agg(row_data ORDER BY hours DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id,
        'name', t.name,
        'color', COALESCE(t.color, 'indigo'),
        'hours', ROUND(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600)::NUMERIC, 2)
      ) AS row_data,
      SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600) AS hours
      FROM base b
      JOIN public.entry_tags et ON et.entry_id = b.id AND et.user_id = b.user_id
      JOIN public.tags t ON t.id = et.tag_id
      GROUP BY t.id, t.name, t.color
      HAVING SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time))) > 0
    ) sub
  ),

  -- ===== 6. Hourly Distribution =====
  hourly AS (
    SELECT COALESCE(json_agg(json_build_object(
      'hour', hour,
      'totalMinutes', total_minutes
    ) ORDER BY hour), '[]'::JSON) AS data
    FROM (
      SELECT
        EXTRACT(HOUR FROM b.start_time AT TIME ZONE v_tz)::INT AS hour,
        ROUND(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::NUMERIC, 1) AS total_minutes
      FROM base b
      GROUP BY EXTRACT(HOUR FROM b.start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),

  -- ===== 7. Day of Week Distribution =====
  dow AS (
    SELECT COALESCE(json_agg(json_build_object(
      'dow', dow,
      'totalMinutes', total_minutes
    ) ORDER BY dow), '[]'::JSON) AS data
    FROM (
      SELECT
        EXTRACT(DOW FROM b.start_time AT TIME ZONE v_tz)::INT AS dow,
        ROUND(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::NUMERIC, 1) AS total_minutes
      FROM base b
      GROUP BY EXTRACT(DOW FROM b.start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),

  -- ===== 8. Energy Map =====
  energy_map AS (
    SELECT COALESCE(json_agg(json_build_object(
      'hour', hour,
      'dow', dow,
      'avgFulfillment', avg_fulfillment,
      'totalMinutes', total_minutes,
      'entryCount', entry_count
    ) ORDER BY hour, dow), '[]'::JSON) AS data
    FROM (
      SELECT
        EXTRACT(HOUR FROM b.start_time AT TIME ZONE v_tz)::INT AS hour,
        EXTRACT(DOW FROM b.start_time AT TIME ZONE v_tz)::INT AS dow,
        AVG(b.fulfillment_score)::DOUBLE PRECISION AS avg_fulfillment,
        SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::DOUBLE PRECISION AS total_minutes,
        COUNT(*)::BIGINT AS entry_count
      FROM base b
      GROUP BY
        EXTRACT(HOUR FROM b.start_time AT TIME ZONE v_tz)::INT,
        EXTRACT(DOW FROM b.start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),

  -- ===== 9. Estimation Accuracy (current) =====
  estimation_accuracy AS (
    SELECT COALESCE(json_agg(row_data ORDER BY entry_count DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id,
        'tagName', t.name,
        'tagColor', COALESCE(t.color, 'indigo'),
        'avgPlannedMinutes', AVG(b.duration_minutes),
        'avgActualMinutes', AVG(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60),
        'avgDeviationMinutes', AVG(ABS(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60 - b.duration_minutes)),
        'entryCount', COUNT(*)
      ) AS row_data,
      COUNT(*) AS entry_count
      FROM base b
      JOIN public.entry_tags et ON et.entry_id = b.id AND et.user_id = b.user_id
      JOIN public.tags t ON t.id = et.tag_id
      WHERE b.origin = 'planned'
        AND b.duration_minutes IS NOT NULL
        AND b.duration_minutes > 0
      GROUP BY t.id, t.name, t.color
      HAVING COUNT(*) >= 2
    ) sub
  ),

  -- ===== 10. Estimation Accuracy (previous) =====
  prev_estimation_accuracy AS (
    SELECT COALESCE(json_agg(row_data ORDER BY entry_count DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id,
        'tagName', t.name,
        'tagColor', COALESCE(t.color, 'indigo'),
        'avgPlannedMinutes', AVG(p.duration_minutes),
        'avgActualMinutes', AVG(EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 60),
        'avgDeviationMinutes', AVG(ABS(EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 60 - p.duration_minutes)),
        'entryCount', COUNT(*)
      ) AS row_data,
      COUNT(*) AS entry_count
      FROM prev p
      JOIN public.entry_tags et ON et.entry_id = p.id AND et.user_id = p.user_id
      JOIN public.tags t ON t.id = et.tag_id
      WHERE p.origin = 'planned'
        AND p.duration_minutes IS NOT NULL
        AND p.duration_minutes > 0
      GROUP BY t.id, t.name, t.color
      HAVING COUNT(*) >= 2
    ) sub
  ),

  -- ===== 11. Energy Map (previous) =====
  prev_energy_map AS (
    SELECT COALESCE(json_agg(json_build_object(
      'hour', hour,
      'dow', dow,
      'avgFulfillment', avg_fulfillment,
      'totalMinutes', total_minutes,
      'entryCount', entry_count
    ) ORDER BY hour, dow), '[]'::JSON) AS data
    FROM (
      SELECT
        EXTRACT(HOUR FROM p.start_time AT TIME ZONE v_tz)::INT AS hour,
        EXTRACT(DOW FROM p.start_time AT TIME ZONE v_tz)::INT AS dow,
        AVG(p.fulfillment_score)::DOUBLE PRECISION AS avg_fulfillment,
        SUM(EXTRACT(EPOCH FROM (p.end_time - p.start_time)) / 60)::DOUBLE PRECISION AS total_minutes,
        COUNT(*)::BIGINT AS entry_count
      FROM prev p
      GROUP BY
        EXTRACT(HOUR FROM p.start_time AT TIME ZONE v_tz)::INT,
        EXTRACT(DOW FROM p.start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),

  -- ===== 12. Daily Hours (year heatmap) =====
  daily_hours AS (
    SELECT COALESCE(json_agg(json_build_object(
      'day', day,
      'hours', hours
    ) ORDER BY day), '[]'::JSON) AS data
    FROM (
      SELECT
        to_char((e.start_time AT TIME ZONE v_tz)::DATE, 'YYYY-MM-DD') AS day,
        ROUND(SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600)::NUMERIC, 2) AS hours
      FROM public.entries e
      WHERE e.user_id = p_user_id
        AND e.deleted_at IS NULL
        AND e.start_time IS NOT NULL
        AND e.end_time IS NOT NULL
        AND EXTRACT(YEAR FROM e.start_time AT TIME ZONE v_tz) = p_year
      GROUP BY (e.start_time AT TIME ZONE v_tz)::DATE
    ) sub
  ),

  -- ===== 13. Monthly Trend =====
  monthly_trend AS (
    SELECT COALESCE(json_agg(json_build_object(
      'month', month,
      'hours', hours
    ) ORDER BY month), '[]'::JSON) AS data
    FROM (
      SELECT
        to_char(date_trunc('month', e.start_time AT TIME ZONE v_tz), 'YYYY-MM') AS month,
        ROUND(SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600)::NUMERIC, 2) AS hours
      FROM public.entries e
      WHERE e.user_id = p_user_id
        AND e.deleted_at IS NULL
        AND e.start_time IS NOT NULL
        AND e.end_time IS NOT NULL
        AND e.start_time >= (date_trunc('month', NOW() AT TIME ZONE v_tz) - (p_monthly_months || ' months')::INTERVAL) AT TIME ZONE v_tz
      GROUP BY date_trunc('month', e.start_time AT TIME ZONE v_tz)
    ) sub
  )

  -- ===== Build final JSON =====
  SELECT json_build_object(
    'overview', o.data,
    'prevOverview', po.data,
    'contextSwitches', cs.data,
    'blankRate', br.data,
    'timeByTag', tbt.data,
    'hourly', h.data,
    'dow', d.data,
    'energyMap', em.data,
    'estimationAccuracy', ea.data,
    'prevEstimationAccuracy', pea.data,
    'prevEnergyMap', pem.data,
    'dailyHours', dh.data,
    'monthlyTrend', mt.data
  ) INTO v_result
  FROM overview o,
       prev_overview po,
       context_switches cs,
       blank_rate br,
       time_by_tag tbt,
       hourly h,
       dow d,
       energy_map em,
       estimation_accuracy ea,
       prev_estimation_accuracy pea,
       prev_energy_map pem,
       daily_hours dh,
       monthly_trend mt;

  RETURN v_result;
END;
$$;
