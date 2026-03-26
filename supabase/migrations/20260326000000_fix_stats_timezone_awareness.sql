-- =============================================================================
-- 統計関数のタイムゾーン対応
--
-- 8個の統計関数 + get_plan_summary が AT TIME ZONE 'UTC' をハードコードしていた。
-- ユーザーの設定タイムゾーン (user_settings.timezone) を参照するよう修正。
--
-- 参照パターン: 20260318130000_fix_stats_context_switches_and_energy_map.sql
-- (get_energy_map / get_context_switches で同じパターンを先行実装済み)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: ユーザーのタイムゾーンを取得する共通関数
-- 各RPC関数で COALESCE(us.timezone, 'UTC') を繰り返すのを避ける
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_timezone(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(us.timezone, 'UTC')
  FROM public.user_settings us
  WHERE us.user_id = p_user_id;
$$;

-- Fallback: user_settings にレコードがない場合
COMMENT ON FUNCTION public.get_user_timezone IS
  'ユーザーの設定タイムゾーンを返す。未設定時は UTC。';

-- -----------------------------------------------------------------------------
-- 1. get_active_dates — アクティブ日付一覧
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_dates(
  p_user_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS SETOF DATE
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
    SELECT DISTINCT (start_time AT TIME ZONE v_tz)::DATE
    FROM public.entries
    WHERE user_id = p_user_id
      AND deleted_at IS NULL
      AND (p_start_date IS NULL OR (start_time AT TIME ZONE v_tz)::DATE >= p_start_date)
      AND (p_end_date IS NULL OR (start_time AT TIME ZONE v_tz)::DATE <= p_end_date)
    ORDER BY 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. get_daily_hours — 日別記録時間
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_daily_hours(
  p_user_id UUID,
  p_year INT
)
RETURNS TABLE(day TEXT, hours NUMERIC)
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
      to_char((e.start_time AT TIME ZONE v_tz)::DATE, 'YYYY-MM-DD'),
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600
      )::NUMERIC, 2)
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND EXTRACT(YEAR FROM e.start_time AT TIME ZONE v_tz) = p_year
    GROUP BY (e.start_time AT TIME ZONE v_tz)::DATE
    ORDER BY 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. get_hourly_distribution — 時間帯別分布
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_hourly_distribution(
  p_user_id UUID,
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
      AND e.deleted_at IS NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time <= p_end_date)
    GROUP BY EXTRACT(HOUR FROM e.start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. get_dow_distribution — 曜日別分布
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dow_distribution(
  p_user_id UUID,
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
      AND e.deleted_at IS NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time <= p_end_date)
    GROUP BY EXTRACT(DOW FROM e.start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. get_monthly_hours — 月別記録時間
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monthly_hours(
  p_user_id UUID,
  p_months INT DEFAULT 12
)
RETURNS TABLE(month TEXT, hours NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
  v_start_date TIMESTAMPTZ;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');
  v_start_date := date_trunc('month', now() AT TIME ZONE v_tz) - (p_months - 1 || ' months')::INTERVAL;

  RETURN QUERY
    SELECT
      to_char(date_trunc('month', e.start_time AT TIME ZONE v_tz), 'YYYY-MM'),
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600
      )::NUMERIC, 2)
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND e.start_time >= v_start_date
    GROUP BY date_trunc('month', e.start_time AT TIME ZONE v_tz)
    ORDER BY 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. get_fulfillment_trend — 充実度トレンド
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fulfillment_trend(
  p_user_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE(day TEXT, avg_fulfillment NUMERIC)
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
      to_char((e.start_time AT TIME ZONE v_tz)::DATE, 'YYYY-MM-DD'),
      ROUND(AVG(e.fulfillment)::NUMERIC, 2)
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND e.fulfillment IS NOT NULL
      AND (e.start_time AT TIME ZONE v_tz)::DATE >= p_start
      AND (e.start_time AT TIME ZONE v_tz)::DATE <= p_end
    GROUP BY (e.start_time AT TIME ZONE v_tz)::DATE
    ORDER BY 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. get_energy_map (DATE overload) — エネルギーマップ（旧インターフェース）
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_energy_map(
  p_user_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE(hour INT, dow INT, total_minutes NUMERIC)
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
      EXTRACT(DOW FROM e.start_time AT TIME ZONE v_tz)::INT,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
      )::NUMERIC, 1)
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND (e.start_time AT TIME ZONE v_tz)::DATE >= p_start
      AND (e.start_time AT TIME ZONE v_tz)::DATE <= p_end
    GROUP BY
      EXTRACT(HOUR FROM e.start_time AT TIME ZONE v_tz)::INT,
      EXTRACT(DOW FROM e.start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1, 2;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. get_weekly_focus_score — 週別集中スコア
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_weekly_focus_score(
  p_user_id UUID,
  p_weeks INT DEFAULT 12
)
RETURNS TABLE(week TEXT, focus_score NUMERIC, total_hours NUMERIC, unique_tags INT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
  v_start_date TIMESTAMPTZ;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');
  v_start_date := date_trunc('week', now() AT TIME ZONE v_tz) - (p_weeks || ' weeks')::INTERVAL;

  RETURN QUERY
    SELECT
      to_char(date_trunc('week', e.start_time AT TIME ZONE v_tz), 'YYYY-MM-DD'),
      ROUND(
        CASE
          WHEN COUNT(DISTINCT e.tag_id) = 0 THEN 0
          ELSE (1.0 / COUNT(DISTINCT e.tag_id)) * 100
        END::NUMERIC, 1
      ),
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600
      )::NUMERIC, 2),
      COUNT(DISTINCT e.tag_id)::INT
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.deleted_at IS NULL
      AND e.start_time >= v_start_date
    GROUP BY date_trunc('week', e.start_time AT TIME ZONE v_tz)
    ORDER BY 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. get_plan_summary — 計画サマリー（月/週の境界をユーザーTZに修正）
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_plan_summary(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
  v_total_count INT;
  v_monthly_hours NUMERIC;
  v_weekly_hours NUMERIC;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  SELECT COUNT(*) INTO v_total_count
  FROM public.entries
  WHERE user_id = p_user_id AND deleted_at IS NULL;

  SELECT COALESCE(ROUND(SUM(
    EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
  )::NUMERIC, 1), 0) INTO v_monthly_hours
  FROM public.entries
  WHERE user_id = p_user_id
    AND deleted_at IS NULL
    AND start_time >= date_trunc('month', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;

  SELECT COALESCE(ROUND(SUM(
    EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
  )::NUMERIC, 1), 0) INTO v_weekly_hours
  FROM public.entries
  WHERE user_id = p_user_id
    AND deleted_at IS NULL
    AND start_time >= date_trunc('week', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;

  RETURN json_build_object(
    'totalCount', v_total_count,
    'monthlyHours', v_monthly_hours,
    'weeklyHours', v_weekly_hours
  );
END;
$$;
