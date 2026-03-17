-- Edge Function用: 振り返り対象ユーザーを取得する関数
-- 条件:
-- 1. 指定週にエントリがある（アクティブ）
-- 2. 累計ユニーク日数がしきい値以上（コールドスタート対策）
-- 3. 当該週の振り返りがまだ生成されていない

CREATE OR REPLACE FUNCTION get_active_users_for_reflection(
  p_week_start DATE,
  p_threshold_days INT DEFAULT 7,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  entry_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH eligible_users AS (
    -- 累計ユニーク日数がしきい値以上のユーザー（CTE で1回だけ集計）
    SELECT e2.user_id
    FROM entries e2
    WHERE e2.start_time IS NOT NULL
    GROUP BY e2.user_id
    HAVING COUNT(DISTINCT (e2.start_time::date)) >= p_threshold_days
  )
  SELECT
    e.user_id,
    COUNT(*) AS entry_count
  FROM entries e
  JOIN eligible_users eu ON eu.user_id = e.user_id
  WHERE
    -- 指定週にエントリがある
    e.start_time >= p_week_start::timestamptz
    AND e.start_time < (p_week_start + INTERVAL '7 days')::timestamptz
    -- まだ振り返りが生成されていない
    AND NOT EXISTS (
      SELECT 1 FROM reflections r
      WHERE r.user_id = e.user_id
        AND r.period_type = 'weekly'
        AND r.period_start = p_week_start
    )
  GROUP BY e.user_id
  ORDER BY entry_count DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_active_users_for_reflection IS 'Edge Function用: 振り返り生成対象のアクティブユーザーを取得';

-- authenticated ロールからのアクセスを禁止（service_role のみ使用可能）
REVOKE EXECUTE ON FUNCTION get_active_users_for_reflection FROM authenticated;
REVOKE EXECUTE ON FUNCTION get_active_users_for_reflection FROM anon;
