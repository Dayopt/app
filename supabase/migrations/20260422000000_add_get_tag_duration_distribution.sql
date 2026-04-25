-- タグごとの直近 duration サンプルを返す RPC
-- sidebar タグ行クリック → エントリ作成ポップアップの duration 候補計算に使用
-- 分布の bucket 化 / 候補抽出 / histogram は client 側で行う
CREATE OR REPLACE FUNCTION public.get_tag_duration_distribution(
  p_user_id UUID,
  p_tag_id UUID,
  p_days_back INT DEFAULT 90,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  entry_id UUID,
  duration_minutes DOUBLE PRECISION,
  started_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT
      e.id AS entry_id,
      EXTRACT(EPOCH FROM (e.end_time - e.start_time))::DOUBLE PRECISION / 60 AS duration_minutes,
      e.start_time AS started_at
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
      AND e.start_time >= (now() - (p_days_back || ' days')::interval)
    ORDER BY e.start_time DESC
    LIMIT p_limit;
END;
$$;
