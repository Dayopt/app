-- =============================================================================
-- 統計関数のインデックス使用最適化
--
-- 前マイグレーション (20260326000000_fix_stats_timezone_awareness.sql) で
-- AT TIME ZONE v_tz を各行に適用するよう修正したが、WHERE句での
-- (start_time AT TIME ZONE v_tz)::DATE >= p_start 形式は
-- idx_entries_start_time インデックスを使用できない問題がある。
--
-- 修正方針:
--   ❌ 各行を変換: (e.start_time AT TIME ZONE v_tz)::DATE >= p_start
--   ✅ 境界値を変換: e.start_time >= (p_start::timestamp AT TIME ZONE v_tz)
--
-- 対象: WHERE句で DATE 範囲フィルタを使う3関数
--   - get_active_dates
--   - get_fulfillment_trend
--   - get_energy_map (DATE overload)
--
-- 非対象 (既にインデックスフレンドリーまたは低優先度):
--   - get_hourly_distribution  : e.start_time >= p_start_date (TIMESTAMPTZ)
--   - get_dow_distribution     : 同上
--   - get_daily_hours          : EXTRACT(YEAR FROM ...) = p_year (低優先度)
--   - get_plan_summary         : date_trunc() AT TIME ZONE v_tz (最適化済み)
-- =============================================================================

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
      -- インデックス使用可能: 境界値を TIMESTAMPTZ に変換して比較
      AND (p_start_date IS NULL OR start_time >= (p_start_date::timestamp AT TIME ZONE v_tz))
      AND (p_end_date IS NULL   OR start_time <  ((p_end_date + 1)::timestamp AT TIME ZONE v_tz))
    ORDER BY 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. get_fulfillment_trend — 充実度トレンド
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
      -- インデックス使用可能: 境界値を TIMESTAMPTZ に変換して比較
      AND e.start_time >= (p_start::timestamp AT TIME ZONE v_tz)
      AND e.start_time <  ((p_end + 1)::timestamp AT TIME ZONE v_tz)
    -- GROUP BY / ORDER BY は引き続き行ごと変換（正確なグループ化のため必要）
    GROUP BY (e.start_time AT TIME ZONE v_tz)::DATE
    ORDER BY 1;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. get_energy_map (DATE overload) — エネルギーマップ（旧インターフェース）
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
      -- インデックス使用可能: 境界値を TIMESTAMPTZ に変換して比較
      AND e.start_time >= (p_start::timestamp AT TIME ZONE v_tz)
      AND e.start_time <  ((p_end + 1)::timestamp AT TIME ZONE v_tz)
    -- GROUP BY / ORDER BY は引き続き行ごと変換（正確なグループ化のため必要）
    GROUP BY
      EXTRACT(HOUR FROM e.start_time AT TIME ZONE v_tz)::INT,
      EXTRACT(DOW FROM e.start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1, 2;
END;
$$;
