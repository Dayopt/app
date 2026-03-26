-- daily-insights Edge Function 用のヘルパー関数 + pg_cron ジョブ

-- =============================================================================
-- 1. アクティブユーザー取得（当日エントリがあるユーザー）
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_active_users_for_daily_insights(
  p_date DATE DEFAULT CURRENT_DATE,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE(user_id UUID, entry_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT e.user_id, COUNT(*)::BIGINT AS entry_count
  FROM public.entries e
  JOIN public.user_settings us ON us.user_id = e.user_id
  WHERE (e.start_time AT TIME ZONE COALESCE(us.timezone, 'UTC'))::DATE = p_date
    AND e.deleted_at IS NULL
  GROUP BY e.user_id
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- 2. 直近N日の日次スナップショット（バーンアウト判定用）
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

-- =============================================================================
-- 3. pg_cron ジョブ登録（毎日 14:00 UTC = 日本時間 23:00）
-- =============================================================================
-- NOTE: Staging/Production では Supabase Dashboard で手動登録する。
-- ローカル開発用に以下を用意:
--
-- SELECT cron.schedule(
--   'daily-insights',
--   '0 14 * * *',
--   $$SELECT public.invoke_edge_function('daily-insights')$$
-- );
