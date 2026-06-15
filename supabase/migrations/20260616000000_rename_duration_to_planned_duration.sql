-- =============================================================================
-- entries.duration_minutes → planned_duration_minutes rename (#1285)
-- =============================================================================
-- duration_minutes は GENERATED ALWAYS STORED 列で start_time/end_time の差分
-- （= 計画 range の長さのみ）を計算する。名前が汎用的で「実績の長さ」と誤読され
-- やすいため、意味ベースの planned_duration_minutes に rename する。
--
-- GENERATED 列の RENAME COLUMN はメタデータのみ（テーブル書き換えなし）。GENERATED
-- 式は start_time/end_time を参照し列自身を参照しないため影響なし。
--
-- entries_effective view は SELECT e.* で作られており出力列名が作成時に固定される
-- ため、RENAME COLUMN に追従しない。view を DROP+CREATE で作り直し、view 経由で
-- この列を read する RPC（get_time_pl_data / get_stats_page_data）と、テーブルを直接
-- read する get_estimation_accuracy を同一 migration で CREATE OR REPLACE する。
-- 列欠落ウィンドウを作らない（architecture.md「凍結 PL/pgSQL」規約への逸脱理由:
--
-- 併せて get_time_pl_data の available CTE の既存バグを修正する: DATE_PART('day',
-- date - date) は date - date が integer（日数）を返すため date_part(unknown, integer)
-- で実行時に必ず失敗していた（rename とは無関係の既存バグ。関数を本 migration で
-- 作り直す以上 bug fix を同梱する）。DATE_PART ラッパーを外して日数差をそのまま使う。
-- 列 rename に伴う必須の追従でありロジック変更は伴わない）。出力フィールド契約
-- （RETURNS TABLE / JSON key / AS ラベル）は不変。
-- =============================================================================

ALTER TABLE public.entries RENAME COLUMN duration_minutes TO planned_duration_minutes;

-- -----------------------------------------------------------------------------
-- entries_effective view の再作成（e.* 展開で新列名を再取得。定義は 20260610 と同一）
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.entries_effective;
CREATE VIEW public.entries_effective
WITH (security_invoker = true) AS
SELECT
  e.*,
  COALESCE(
    e.actual_start_time,
    CASE
      WHEN e.origin = 'planned' AND e.skipped_at IS NULL AND e.end_time <= NOW()
      THEN e.start_time
    END
  ) AS effective_start_time,
  COALESCE(
    e.actual_end_time,
    CASE
      WHEN e.origin = 'planned' AND e.skipped_at IS NULL AND e.end_time <= NOW()
      THEN e.end_time
    END
  ) AS effective_end_time
FROM public.entries e
WHERE e.deleted_at IS NULL;

REVOKE ALL ON public.entries_effective FROM PUBLIC;
REVOKE ALL ON public.entries_effective FROM anon;
GRANT SELECT ON public.entries_effective TO authenticated;
GRANT SELECT ON public.entries_effective TO service_role;

-- -----------------------------------------------------------------------------
-- get_estimation_accuracy（現行: 20260415_inline_entry_tag_id.sql。列 read のみ置換）
-- -----------------------------------------------------------------------------
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
    AVG(e.planned_duration_minutes)::DOUBLE PRECISION AS avg_planned_minutes,
    AVG(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60)::DOUBLE PRECISION AS avg_actual_minutes,
    AVG(
      ABS(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60 - e.planned_duration_minutes)
    )::DOUBLE PRECISION AS avg_deviation_minutes,
    COUNT(*)::BIGINT AS entry_count
  FROM public.entries e
  JOIN public.tags t ON t.id = e.tag_id
  WHERE e.user_id = p_user_id
    AND e.origin = 'planned'
    AND e.planned_duration_minutes IS NOT NULL
    AND e.planned_duration_minutes > 0
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time < p_end_date)
  GROUP BY t.id, t.name, t.color
  HAVING COUNT(*) >= 2
  ORDER BY COUNT(*) DESC;
END;
$$;

-- -----------------------------------------------------------------------------
-- get_time_pl_data（現行: 20260610_entry_auto_record_model.sql。列 read のみ置換）
-- -----------------------------------------------------------------------------
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
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND (
        (
          e.effective_start_time IS NOT NULL
          AND e.effective_start_time < p_end_date
          AND e.effective_end_time > p_start_date
        )
        OR (
          e.origin = 'planned'
          AND e.start_time < p_end_date
          AND e.end_time > p_start_date
        )
      )
  ),

  prev AS (
    SELECT e.*
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND p_prev_start IS NOT NULL
      AND p_prev_end IS NOT NULL
      AND (
        (
          e.effective_start_time IS NOT NULL
          AND e.effective_start_time < p_prev_end
          AND e.effective_end_time > p_prev_start
        )
        OR (
          e.origin = 'planned'
          AND e.start_time < p_prev_end
          AND e.end_time > p_prev_start
        )
      )
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
          CASE WHEN b.origin = 'planned' AND b.planned_duration_minutes IS NOT NULL
               THEN b.planned_duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1),
        'actualMinutes', ROUND(COALESCE(SUM(
          CASE WHEN b.effective_start_time IS NOT NULL
               THEN EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60
               ELSE 0 END
        ), 0)::NUMERIC, 1),
        'isPlanned', BOOL_OR(b.origin = 'planned' AND b.planned_duration_minutes IS NOT NULL AND b.planned_duration_minutes > 0)
      ) AS row_data,
      COALESCE(SUM(
        CASE WHEN b.effective_start_time IS NOT NULL
             THEN EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60
             ELSE 0 END
      ), 0) AS total_actual
      FROM base b
      JOIN public.tags t ON t.id = b.tag_id
      WHERE b.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color, t.icon
      HAVING COALESCE(SUM(
        CASE WHEN b.effective_start_time IS NOT NULL
             THEN EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time))
             ELSE 0 END
      ), 0) > 0
         OR SUM(CASE WHEN b.origin = 'planned' THEN COALESCE(b.planned_duration_minutes, 0) ELSE 0 END) > 0
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
          CASE WHEN p.origin = 'planned' AND p.planned_duration_minutes IS NOT NULL
               THEN p.planned_duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1),
        'actualMinutes', ROUND(COALESCE(SUM(
          CASE WHEN p.effective_start_time IS NOT NULL
               THEN EXTRACT(EPOCH FROM (p.effective_end_time - p.effective_start_time)) / 60
               ELSE 0 END
        ), 0)::NUMERIC, 1),
        'isPlanned', BOOL_OR(p.origin = 'planned' AND p.planned_duration_minutes IS NOT NULL AND p.planned_duration_minutes > 0)
      ) AS row_data,
      COALESCE(SUM(
        CASE WHEN p.effective_start_time IS NOT NULL
             THEN EXTRACT(EPOCH FROM (p.effective_end_time - p.effective_start_time)) / 60
             ELSE 0 END
      ), 0) AS total_actual
      FROM prev p
      JOIN public.tags t ON t.id = p.tag_id
      WHERE p.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color, t.icon
      HAVING COALESCE(SUM(
        CASE WHEN p.effective_start_time IS NOT NULL
             THEN EXTRACT(EPOCH FROM (p.effective_end_time - p.effective_start_time))
             ELSE 0 END
      ), 0) > 0
         OR SUM(CASE WHEN p.origin = 'planned' THEN COALESCE(p.planned_duration_minutes, 0) ELSE 0 END) > 0
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
        (COALESCE(b.effective_start_time, b.start_time) AT TIME ZONE v_tz)::DATE AS day,
        ROUND(COALESCE(SUM(
          CASE WHEN b.origin = 'planned' AND b.planned_duration_minutes IS NOT NULL
               THEN b.planned_duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1) AS budget_min,
        ROUND(COALESCE(SUM(
          CASE WHEN b.effective_start_time IS NOT NULL
               THEN EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60
               ELSE 0 END
        ), 0)::NUMERIC, 1) AS actual_min
      FROM base b
      GROUP BY (COALESCE(b.effective_start_time, b.start_time) AT TIME ZONE v_tz)::DATE
    ) sub
  ),

  available AS (
    SELECT
      CASE
        WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60
        ELSE (p_sleep_hour - p_wake_hour) * 60
      END *
      (((p_end_date AT TIME ZONE v_tz)::DATE - (p_start_date AT TIME ZONE v_tz)::DATE)::INT + 1)
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

-- -----------------------------------------------------------------------------
-- get_stats_page_data（現行: 20260610_entry_auto_record_model.sql。列 read のみ置換）
-- -----------------------------------------------------------------------------
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
    SELECT e.* FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.effective_start_time IS NOT NULL
      AND e.effective_start_time >= p_start_date AND e.effective_start_time < p_end_date
  ),
  prev AS (
    SELECT e.* FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.effective_start_time IS NOT NULL
      AND e.effective_start_time >= p_prev_start AND e.effective_start_time < p_prev_end
  ),
  overview AS (
    SELECT json_build_object(
      'totalMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60), 0),
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
      'totalMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (p.effective_end_time - p.effective_start_time)) / 60), 0),
      'avgFulfillment', AVG(p.fulfillment_score),
      'entryCount', COUNT(p.fulfillment_score) FILTER (WHERE p.fulfillment_score IS NOT NULL),
      'totalEntries', COUNT(*),
      'plannedEntries', COUNT(*) FILTER (WHERE p.origin = 'planned'),
      'planRate', CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE p.origin = 'planned')::DOUBLE PRECISION / COUNT(*) ELSE 0 END
    ) AS data FROM prev p
  ),
  cs_tags AS (
    SELECT b.id, b.effective_start_time,
      (b.effective_start_time AT TIME ZONE v_tz)::DATE AS entry_date, b.tag_id
    FROM base b
  ),
  cs_ordered AS (
    SELECT entry_date, tag_id,
      LAG(tag_id) OVER (PARTITION BY entry_date ORDER BY effective_start_time) AS prev_tag_id
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
      'scheduledMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60), 0),
      'blankRate', CASE
        WHEN CASE
          WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
          ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT END > 0 THEN
          GREATEST(0,
            CASE
              WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
              ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT END
            - COALESCE(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60), 0)
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
        'hours', ROUND(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 3600)::NUMERIC, 2)
      ) AS row_data,
      SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 3600) AS hours
      FROM base b
      JOIN public.tags t ON t.id = b.tag_id
      WHERE b.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color
      HAVING SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time))) > 0
    ) sub
  ),
  hourly AS (
    SELECT COALESCE(json_agg(json_build_object('hour', hour, 'totalMinutes', total_minutes) ORDER BY hour), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(HOUR FROM b.effective_start_time AT TIME ZONE v_tz)::INT AS hour,
        ROUND(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60)::NUMERIC, 1) AS total_minutes
      FROM base b GROUP BY EXTRACT(HOUR FROM b.effective_start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  dow AS (
    SELECT COALESCE(json_agg(json_build_object('dow', dow, 'totalMinutes', total_minutes) ORDER BY dow), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(DOW FROM b.effective_start_time AT TIME ZONE v_tz)::INT AS dow,
        ROUND(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60)::NUMERIC, 1) AS total_minutes
      FROM base b GROUP BY EXTRACT(DOW FROM b.effective_start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  energy_map AS (
    SELECT COALESCE(json_agg(json_build_object(
      'hour', hour, 'dow', dow, 'avgFulfillment', avg_fulfillment,
      'totalMinutes', total_minutes, 'entryCount', entry_count
    ) ORDER BY hour, dow), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(HOUR FROM b.effective_start_time AT TIME ZONE v_tz)::INT AS hour,
        EXTRACT(DOW FROM b.effective_start_time AT TIME ZONE v_tz)::INT AS dow,
        AVG(b.fulfillment_score)::DOUBLE PRECISION AS avg_fulfillment,
        SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60)::DOUBLE PRECISION AS total_minutes,
        COUNT(*)::BIGINT AS entry_count
      FROM base b GROUP BY
        EXTRACT(HOUR FROM b.effective_start_time AT TIME ZONE v_tz)::INT,
        EXTRACT(DOW FROM b.effective_start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  estimation_accuracy AS (
    SELECT COALESCE(json_agg(row_data ORDER BY entry_count DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id, 'tagName', t.name, 'tagColor', COALESCE(t.color, 'indigo'),
        'avgPlannedMinutes', AVG(b.planned_duration_minutes),
        'avgActualMinutes', AVG(EXTRACT(EPOCH FROM (b.actual_end_time - b.actual_start_time)) / 60),
        'avgDeviationMinutes', AVG(ABS(EXTRACT(EPOCH FROM (b.actual_end_time - b.actual_start_time)) / 60 - b.planned_duration_minutes)),
        'entryCount', COUNT(*)
      ) AS row_data, COUNT(*) AS entry_count
      FROM base b
      JOIN public.tags t ON t.id = b.tag_id
      WHERE b.tag_id IS NOT NULL AND b.origin = 'planned'
        AND b.actual_start_time IS NOT NULL AND b.actual_end_time IS NOT NULL
        AND b.planned_duration_minutes IS NOT NULL AND b.planned_duration_minutes > 0
      GROUP BY t.id, t.name, t.color HAVING COUNT(*) >= 2
    ) sub
  ),
  prev_estimation_accuracy AS (
    SELECT COALESCE(json_agg(row_data ORDER BY entry_count DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id, 'tagName', t.name, 'tagColor', COALESCE(t.color, 'indigo'),
        'avgPlannedMinutes', AVG(p.planned_duration_minutes),
        'avgActualMinutes', AVG(EXTRACT(EPOCH FROM (p.actual_end_time - p.actual_start_time)) / 60),
        'avgDeviationMinutes', AVG(ABS(EXTRACT(EPOCH FROM (p.actual_end_time - p.actual_start_time)) / 60 - p.planned_duration_minutes)),
        'entryCount', COUNT(*)
      ) AS row_data, COUNT(*) AS entry_count
      FROM prev p
      JOIN public.tags t ON t.id = p.tag_id
      WHERE p.tag_id IS NOT NULL AND p.origin = 'planned'
        AND p.actual_start_time IS NOT NULL AND p.actual_end_time IS NOT NULL
        AND p.planned_duration_minutes IS NOT NULL AND p.planned_duration_minutes > 0
      GROUP BY t.id, t.name, t.color HAVING COUNT(*) >= 2
    ) sub
  ),
  prev_energy_map AS (
    SELECT COALESCE(json_agg(json_build_object(
      'hour', hour, 'dow', dow, 'avgFulfillment', avg_fulfillment,
      'totalMinutes', total_minutes, 'entryCount', entry_count
    ) ORDER BY hour, dow), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(HOUR FROM p.effective_start_time AT TIME ZONE v_tz)::INT AS hour,
        EXTRACT(DOW FROM p.effective_start_time AT TIME ZONE v_tz)::INT AS dow,
        AVG(p.fulfillment_score)::DOUBLE PRECISION AS avg_fulfillment,
        SUM(EXTRACT(EPOCH FROM (p.effective_end_time - p.effective_start_time)) / 60)::DOUBLE PRECISION AS total_minutes,
        COUNT(*)::BIGINT AS entry_count
      FROM prev p GROUP BY
        EXTRACT(HOUR FROM p.effective_start_time AT TIME ZONE v_tz)::INT,
        EXTRACT(DOW FROM p.effective_start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  daily_hours AS (
    SELECT COALESCE(json_agg(json_build_object('day', day, 'hours', hours) ORDER BY day), '[]'::JSON) AS data
    FROM (
      SELECT to_char((e.effective_start_time AT TIME ZONE v_tz)::DATE, 'YYYY-MM-DD') AS day,
        ROUND(SUM(EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 3600)::NUMERIC, 2) AS hours
      FROM public.entries_effective e
      WHERE e.user_id = p_user_id
        AND e.effective_start_time IS NOT NULL
        AND EXTRACT(YEAR FROM e.effective_start_time AT TIME ZONE v_tz) = p_year
      GROUP BY (e.effective_start_time AT TIME ZONE v_tz)::DATE
    ) sub
  ),
  monthly_trend AS (
    SELECT COALESCE(json_agg(json_build_object('month', month, 'hours', hours) ORDER BY month), '[]'::JSON) AS data
    FROM (
      SELECT to_char(date_trunc('month', e.effective_start_time AT TIME ZONE v_tz), 'YYYY-MM') AS month,
        ROUND(SUM(EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 3600)::NUMERIC, 2) AS hours
      FROM public.entries_effective e
      WHERE e.user_id = p_user_id
        AND e.effective_start_time IS NOT NULL
        AND e.effective_start_time >= (date_trunc('month', NOW() AT TIME ZONE v_tz) - (p_monthly_months || ' months')::INTERVAL) AT TIME ZONE v_tz
      GROUP BY date_trunc('month', e.effective_start_time AT TIME ZONE v_tz)
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

