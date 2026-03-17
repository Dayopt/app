-- Session 2.2: 集計クエリ + ゲーミフィケーション指標
-- 振り返り + ゲーミフィケーションに必要な全集計関数を構築

-- ============================================================
-- 1. 週次振り返りデータ
-- ============================================================
CREATE OR REPLACE FUNCTION get_weekly_reflection_data(
  p_user_id UUID,
  p_week_start DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  week_end DATE := p_week_start + 6;
BEGIN
  SELECT json_build_object(
    'totalEntries', (
      SELECT count(*)
      FROM entries
      WHERE user_id = p_user_id
        AND start_time >= p_week_start::timestamptz
        AND start_time < (week_end + 1)::timestamptz
    ),
    'plannedEntries', (
      SELECT count(*)
      FROM entries
      WHERE user_id = p_user_id
        AND origin = 'planned'
        AND start_time >= p_week_start::timestamptz
        AND start_time < (week_end + 1)::timestamptz
    ),
    'unplannedEntries', (
      SELECT count(*)
      FROM entries
      WHERE user_id = p_user_id
        AND origin = 'unplanned'
        AND start_time >= p_week_start::timestamptz
        AND start_time < (week_end + 1)::timestamptz
    ),
    'totalMinutes', (
      SELECT COALESCE(sum(
        CASE
          WHEN duration_minutes IS NOT NULL THEN duration_minutes
          WHEN start_time IS NOT NULL AND end_time IS NOT NULL
            THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60
          ELSE 0
        END
      ), 0)
      FROM entries
      WHERE user_id = p_user_id
        AND start_time >= p_week_start::timestamptz
        AND start_time < (week_end + 1)::timestamptz
    ),
    'avgFulfillment', (
      SELECT COALESCE(avg(fulfillment_score), 0)
      FROM entries
      WHERE user_id = p_user_id
        AND fulfillment_score IS NOT NULL
        AND start_time >= p_week_start::timestamptz
        AND start_time < (week_end + 1)::timestamptz
    ),
    'reviewedCount', (
      SELECT count(*)
      FROM entries
      WHERE user_id = p_user_id
        AND reviewed_at IS NOT NULL
        AND start_time >= p_week_start::timestamptz
        AND start_time < (week_end + 1)::timestamptz
    ),
    'tagBreakdown', (
      SELECT COALESCE(json_agg(json_build_object(
        'tagId', t.id,
        'tagName', t.name,
        'tagColor', t.color,
        'minutes', sub.total_minutes,
        'entryCount', sub.entry_count
      )), '[]'::json)
      FROM (
        SELECT et.tag_id,
               sum(CASE
                 WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes
                 WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL
                   THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
                 ELSE 0
               END) AS total_minutes,
               count(*) AS entry_count
        FROM entries e
        JOIN entry_tags et ON e.id = et.entry_id
        WHERE e.user_id = p_user_id
          AND e.start_time >= p_week_start::timestamptz
          AND e.start_time < (week_end + 1)::timestamptz
        GROUP BY et.tag_id
      ) sub
      JOIN tags t ON t.id = sub.tag_id
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 2. 充実度トレンド
-- ============================================================
CREATE OR REPLACE FUNCTION get_fulfillment_trend(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (date TEXT, avg_score DOUBLE PRECISION, count INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(e.start_time::date, 'YYYY-MM-DD') AS date,
    avg(e.fulfillment_score)::double precision AS avg_score,
    count(*)::int AS count
  FROM entries e
  WHERE e.user_id = p_user_id
    AND e.fulfillment_score IS NOT NULL
    AND e.start_time >= p_start_date::timestamptz
    AND e.start_time < (p_end_date + 1)::timestamptz
  GROUP BY e.start_time::date
  ORDER BY e.start_time::date;
END;
$$;

-- ============================================================
-- 3. エネルギーマップ（時間帯×曜日×充実度）
-- ============================================================
CREATE OR REPLACE FUNCTION get_energy_map(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  hour INT,
  dow INT,
  avg_fulfillment DOUBLE PRECISION,
  total_minutes DOUBLE PRECISION,
  entry_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM e.start_time)::int AS hour,
    EXTRACT(DOW FROM e.start_time)::int AS dow,
    avg(e.fulfillment_score)::double precision AS avg_fulfillment,
    sum(CASE
      WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes
      WHEN e.end_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
      ELSE 0
    END)::double precision AS total_minutes,
    count(*)::int AS entry_count
  FROM entries e
  WHERE e.user_id = p_user_id
    AND e.start_time IS NOT NULL
    AND e.start_time >= p_start_date::timestamptz
    AND e.start_time < (p_end_date + 1)::timestamptz
  GROUP BY EXTRACT(HOUR FROM e.start_time), EXTRACT(DOW FROM e.start_time)
  ORDER BY hour, dow;
END;
$$;

-- ============================================================
-- 4. タイムボクシング遵守率
-- ============================================================
CREATE OR REPLACE FUNCTION get_timeboxing_adherence(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'totalPlanned', (
      SELECT count(*)
      FROM entries
      WHERE user_id = p_user_id
        AND origin = 'planned'
        AND start_time IS NOT NULL
        AND end_time IS NOT NULL
        AND start_time >= p_start_date::timestamptz
        AND start_time < (p_end_date + 1)::timestamptz
    ),
    'reviewed', (
      SELECT count(*)
      FROM entries
      WHERE user_id = p_user_id
        AND origin = 'planned'
        AND reviewed_at IS NOT NULL
        AND start_time >= p_start_date::timestamptz
        AND start_time < (p_end_date + 1)::timestamptz
    ),
    'adherenceRate', (
      SELECT CASE
        WHEN count(*) = 0 THEN 0
        ELSE (count(*) FILTER (WHERE reviewed_at IS NOT NULL))::double precision / count(*)::double precision
      END
      FROM entries
      WHERE user_id = p_user_id
        AND origin = 'planned'
        AND start_time IS NOT NULL
        AND end_time IS NOT NULL
        AND start_time >= p_start_date::timestamptz
        AND start_time < (p_end_date + 1)::timestamptz
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- 5. 週別集中スコア（充実度×時間の加重平均）
-- ============================================================
CREATE OR REPLACE FUNCTION get_weekly_focus_score(
  p_user_id UUID,
  p_weeks INT DEFAULT 8
)
RETURNS TABLE (
  week_start TEXT,
  focus_score DOUBLE PRECISION,
  total_minutes DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(date_trunc('week', e.start_time)::date, 'YYYY-MM-DD') AS week_start,
    CASE
      WHEN sum(CASE
        WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes
        WHEN e.end_time IS NOT NULL
          THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
        ELSE 0
      END) = 0 THEN 0
      ELSE sum(
        e.fulfillment_score * CASE
          WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes
          WHEN e.end_time IS NOT NULL
            THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
          ELSE 0
        END
      )::double precision / NULLIF(sum(CASE
        WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes
        WHEN e.end_time IS NOT NULL
          THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
        ELSE 0
      END), 0)::double precision
    END AS focus_score,
    sum(CASE
      WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes
      WHEN e.end_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
      ELSE 0
    END)::double precision AS total_minutes
  FROM entries e
  WHERE e.user_id = p_user_id
    AND e.fulfillment_score IS NOT NULL
    AND e.start_time >= (current_date - (p_weeks * 7))::timestamptz
  GROUP BY date_trunc('week', e.start_time)
  ORDER BY week_start;
END;
$$;
