-- タグ統計を効率的に取得するPostgreSQL関数
--
-- 目的: getTagPlanCounts と getTagLastUsed を1つの効率的なクエリに統合
--
-- Before: 全plan_tagsレコードを取得してJS側で集計（数千行転送）
-- After:  DB側でGROUP BY集計して結果のみ転送（数十行）
--
-- 期待される改善: 1000-2000ms → 50-100ms

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
  SELECT
    pt.tag_id,
    COUNT(*)::BIGINT as plan_count,
    MAX(pt.created_at) as last_used
  FROM plan_tags pt
  INNER JOIN plans p ON p.id = pt.plan_id
  WHERE p.user_id = p_user_id
  GROUP BY pt.tag_id;
$$;

-- 関数の説明
COMMENT ON FUNCTION get_tag_stats(UUID) IS 'ユーザーのタグ統計（使用回数・最終使用日）を効率的に取得';

-- 認証済みユーザーのみ実行可能
GRANT EXECUTE ON FUNCTION get_tag_stats(UUID) TO authenticated;
