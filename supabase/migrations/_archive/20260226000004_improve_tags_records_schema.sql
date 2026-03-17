-- ==================================================================
-- P2: tags/records スキーマ改善 + get_tag_stats 拡張
-- ==================================================================

-- tags.user_id NOT NULL 制約追加
-- 個人向けアプリでグローバルタグ（user_id=NULL）は不要
-- RLS パフォーマンスも改善（OR user_id IS NULL 条件の除去）
DELETE FROM plan_tags WHERE tag_id IN (SELECT id FROM tags WHERE user_id IS NULL);
DELETE FROM record_tags WHERE tag_id IN (SELECT id FROM tags WHERE user_id IS NULL);
DELETE FROM tags WHERE user_id IS NULL;
ALTER TABLE tags ALTER COLUMN user_id SET NOT NULL;

-- records 重複チェック用部分インデックス
-- RecordService の時間重複チェッククエリを高速化
CREATE INDEX IF NOT EXISTS idx_records_user_date_times
  ON records(user_id, worked_at, start_time, end_time)
  WHERE start_time IS NOT NULL AND end_time IS NOT NULL;

-- get_tag_stats を record_tags 対応に拡張
-- Before: plan_tags のみカウント
-- After: plan_tags + record_tags の両方をカウント
DROP FUNCTION IF EXISTS get_tag_stats(UUID);

CREATE FUNCTION get_tag_stats(p_user_id UUID)
RETURNS TABLE (
  tag_id UUID,
  plan_count BIGINT,
  record_count BIGINT,
  last_used TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS tag_id,
    COALESCE(pt.cnt, 0) AS plan_count,
    COALESCE(rt.cnt, 0) AS record_count,
    GREATEST(pt.last_used, rt.last_used) AS last_used
  FROM tags t
  LEFT JOIN (
    SELECT tag_id, COUNT(*) AS cnt, MAX(created_at) AS last_used
    FROM plan_tags GROUP BY tag_id
  ) pt ON pt.tag_id = t.id
  LEFT JOIN (
    SELECT tag_id, COUNT(*) AS cnt, MAX(created_at) AS last_used
    FROM record_tags GROUP BY tag_id
  ) rt ON rt.tag_id = t.id
  WHERE t.user_id = p_user_id AND t.is_active = true

  UNION ALL

  SELECT
    NULL::UUID AS tag_id,
    COUNT(*)::BIGINT AS plan_count,
    0::BIGINT AS record_count,
    MAX(p.created_at) AS last_used
  FROM plans p
  WHERE p.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM plan_tags pt WHERE pt.plan_id = p.id
    );
$$;

GRANT EXECUTE ON FUNCTION get_tag_stats(UUID) TO authenticated;

COMMENT ON FUNCTION get_tag_stats(UUID) IS
  'ユーザーのタグ統計（plan/record使用回数・最終使用日）を効率的に取得。tag_id=NULLはタグなしプラン件数。';
