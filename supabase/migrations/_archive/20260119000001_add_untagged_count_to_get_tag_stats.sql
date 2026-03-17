-- get_tag_stats関数を拡張: タグなしプラン件数も返すように
--
-- 変更点:
-- - tag_id = NULL の行でタグなしプランの件数を返す
-- - 既存の行（タグごとの統計）はそのまま維持
--
-- 使用方法:
-- - tag_id が NULL の行 → untaggedCount
-- - tag_id が UUID の行 → 各タグの統計

CREATE OR REPLACE FUNCTION get_tag_stats(p_user_id UUID)
RETURNS TABLE (
  tag_id UUID,
  plan_count BIGINT,
  last_used TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- タグごとの統計
  SELECT
    pt.tag_id,
    COUNT(*)::BIGINT as plan_count,
    MAX(pt.created_at) as last_used
  FROM plan_tags pt
  INNER JOIN plans p ON p.id = pt.plan_id
  WHERE p.user_id = p_user_id
  GROUP BY pt.tag_id

  UNION ALL

  -- タグなしプランの件数（tag_id = NULL で表現）
  SELECT
    NULL::UUID as tag_id,
    COUNT(*)::BIGINT as plan_count,
    MAX(p.created_at) as last_used
  FROM plans p
  WHERE p.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM plan_tags pt WHERE pt.plan_id = p.id
    );
$$;

-- 関数の説明を更新
COMMENT ON FUNCTION get_tag_stats(UUID) IS 'ユーザーのタグ統計（使用回数・最終使用日）を効率的に取得。tag_id=NULLはタグなしプラン件数。';
