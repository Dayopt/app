-- ==================================================================
-- P1: 統計クエリ用 DB 側集計関数
--
-- Before: 全プランを取得→JS側でfor-of集計（1000件超でp95悪化）
-- After: DB側でSUM/GROUP BY → 結果のみ転送
-- ==================================================================

-- getSummary: 全期間の合計、今月/先月/今週の統計を一括取得
CREATE OR REPLACE FUNCTION get_plan_summary(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_this_month_start TIMESTAMPTZ;
  v_last_month_start TIMESTAMPTZ;
  v_last_month_end TIMESTAMPTZ;
  v_this_week_start TIMESTAMPTZ;
BEGIN
  v_this_month_start := date_trunc('month', NOW());
  v_last_month_start := date_trunc('month', NOW() - INTERVAL '1 month');
  v_last_month_end := v_this_month_start - INTERVAL '1 second';
  v_this_week_start := date_trunc('week', NOW());

  SELECT json_build_object(
    'totalHours', COALESCE(SUM(
      EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
    ) FILTER (WHERE start_time IS NOT NULL AND end_time IS NOT NULL
              AND end_time > start_time), 0),
    'thisMonthHours', COALESCE(SUM(
      EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
    ) FILTER (WHERE start_time IS NOT NULL AND end_time IS NOT NULL
              AND end_time > start_time
              AND start_time >= v_this_month_start), 0),
    'lastMonthHours', COALESCE(SUM(
      EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
    ) FILTER (WHERE start_time IS NOT NULL AND end_time IS NOT NULL
              AND end_time > start_time
              AND start_time >= v_last_month_start
              AND start_time <= v_last_month_end), 0),
    'completedTasks', COUNT(*) FILTER (WHERE status = 'closed'),
    'thisWeekCompleted', COUNT(*) FILTER (
      WHERE status = 'closed' AND updated_at >= v_this_week_start
    )
  ) INTO result
  FROM plans
  WHERE user_id = p_user_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_plan_summary TO authenticated;


-- getStreak 用: ユニーク日の一覧（JS側でstreak計算）
CREATE OR REPLACE FUNCTION get_active_dates(
  p_user_id UUID,
  p_since TIMESTAMPTZ
)
RETURNS TABLE (active_date DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT (start_time AT TIME ZONE 'UTC')::DATE AS active_date
  FROM plans
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL
    AND start_time >= p_since;
$$;

GRANT EXECUTE ON FUNCTION get_active_dates TO authenticated;


-- getDailyHours: ヒートマップ用の日別時間集計
CREATE OR REPLACE FUNCTION get_daily_hours(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (date TEXT, hours DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char(start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) AS hours
  FROM plans
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL
    AND end_time > start_time
    AND start_time >= p_start_date
    AND start_time <= p_end_date
  GROUP BY to_char(start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD');
$$;

GRANT EXECUTE ON FUNCTION get_daily_hours TO authenticated;


-- getHourlyDistribution: 時間帯別分布
CREATE OR REPLACE FUNCTION get_hourly_distribution(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (hour INT, hours DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(HOUR FROM start_time)::INT AS hour,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) AS hours
  FROM plans
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL
    AND end_time > start_time
    AND (p_start_date IS NULL OR start_time >= p_start_date)
    AND (p_end_date IS NULL OR start_time <= p_end_date)
  GROUP BY EXTRACT(HOUR FROM start_time)::INT;
$$;

GRANT EXECUTE ON FUNCTION get_hourly_distribution TO authenticated;


-- getDayOfWeekDistribution: 曜日別分布
CREATE OR REPLACE FUNCTION get_dow_distribution(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (dow INT, hours DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(DOW FROM start_time)::INT AS dow,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) AS hours
  FROM plans
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL
    AND end_time > start_time
    AND (p_start_date IS NULL OR start_time >= p_start_date)
    AND (p_end_date IS NULL OR start_time <= p_end_date)
  GROUP BY EXTRACT(DOW FROM start_time)::INT;
$$;

GRANT EXECUTE ON FUNCTION get_dow_distribution TO authenticated;


-- getMonthlyTrend: 月別時間推移
CREATE OR REPLACE FUNCTION get_monthly_hours(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ
)
RETURNS TABLE (month TEXT, hours DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char(start_time, 'YYYY-MM') AS month,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) AS hours
  FROM plans
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL
    AND end_time > start_time
    AND start_time >= p_start_date
  GROUP BY to_char(start_time, 'YYYY-MM');
$$;

GRANT EXECUTE ON FUNCTION get_monthly_hours TO authenticated;


-- getTotalTime: 全プランの合計時間
CREATE OR REPLACE FUNCTION get_total_time(p_user_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'totalMinutes', COALESCE(SUM(
      EXTRACT(EPOCH FROM (end_time - start_time)) / 60.0
    ) FILTER (WHERE end_time > start_time), 0),
    'planCount', COUNT(*) FILTER (
      WHERE start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time
    )
  )
  FROM plans
  WHERE user_id = p_user_id
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION get_total_time TO authenticated;
