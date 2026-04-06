-- daily_insights 関数の IDOR 脆弱性修正
-- get_active_users_for_daily_insights: 全ユーザー情報を返すため service_role のみに制限
-- get_daily_snapshots: auth.uid() チェックを追加

-- =============================================================================
-- 1. get_active_users_for_daily_insights — PUBLIC から REVOKE
-- =============================================================================

REVOKE ALL ON FUNCTION public.get_active_users_for_daily_insights(DATE, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_users_for_daily_insights(DATE, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_users_for_daily_insights(DATE, INTEGER) TO service_role;

-- =============================================================================
-- 2. get_daily_snapshots — auth.uid() チェック追加
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_daily_snapshots(
  p_user_id UUID,
  p_days INTEGER DEFAULT 3
)
RETURNS TABLE(day TEXT, total_minutes NUMERIC, avg_fulfillment NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  -- IDOR防止: 自分自身のデータのみ取得可能
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'access_denied: user_id mismatch';
  END IF;

  SELECT COALESCE(us.timezone, 'UTC') INTO v_tz
  FROM public.user_settings us
  WHERE us.user_id = p_user_id;

  IF v_tz IS NULL THEN
    v_tz := 'UTC';
  END IF;

  RETURN QUERY
  SELECT
    (e.start_time AT TIME ZONE v_tz)::DATE::TEXT AS day,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60
    ), 0)::NUMERIC AS total_minutes,
    AVG(e.fulfillment_score)::NUMERIC AS avg_fulfillment
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.deleted_at IS NULL
    AND (e.start_time AT TIME ZONE v_tz)::DATE >= (CURRENT_DATE - p_days)
    AND (e.start_time AT TIME ZONE v_tz)::DATE <= CURRENT_DATE
  GROUP BY (e.start_time AT TIME ZONE v_tz)::DATE
  ORDER BY day DESC
  LIMIT p_days;
END;
$$;
