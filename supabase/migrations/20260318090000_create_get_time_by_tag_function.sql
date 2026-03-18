-- ============================================================
-- get_time_by_tag: タグ別の合計時間を取得するDB関数
-- ============================================================
-- 背景: 従来は3回の逐次クエリ + クライアント側O(n*m)ループで計算していた
-- 改善: 他の統計関数(get_daily_hours等)と同じSECURITY DEFINERパターンに統一

CREATE OR REPLACE FUNCTION public.get_time_by_tag(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  tag_id UUID,
  tag_name TEXT,
  tag_color TEXT,
  hours DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT
    t.id AS tag_id,
    t.name AS tag_name,
    COALESCE(t.color, 'indigo') AS tag_color,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600.0
    ), 0) AS hours
  FROM public.entries e
  JOIN public.entry_tags et ON et.entry_id = e.id
  JOIN public.tags t ON t.id = et.tag_id
  WHERE e.user_id = p_user_id
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL
    AND e.end_time > e.start_time
    AND (p_start_date IS NULL OR e.start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.start_time <= p_end_date)
  GROUP BY t.id, t.name, t.color
  HAVING SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time))) > 0
  ORDER BY hours DESC;
END;
$$;
