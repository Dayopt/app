-- ==================================================================
-- タグシステム再設計マイグレーション
--
-- 目的:
-- 1. 1エントリ1タグ制約（時間は排他的リソース → 分類も排他）
-- 2. コロン記法で2階層（"開発:api"）、parent_id不要
-- 3. 「タグなし」フィルター概念の廃止
--
-- 変更点:
-- 1. 親子タグ名をコロン記法にマージ（parent_id → 名前に統合）
-- 2. 複数タグ → 最初の1件のみ残す
-- 3. entry_tags に UNIQUE(entry_id) 制約追加（1:1）
-- 4. parent_id カラム・トリガー・関数を削除
-- 5. get_tag_stats から untagged 行を削除
-- ==================================================================

-- ============================================================
-- Step 1: 親子タグ名をコロン記法にマージ
-- parent_id 削除前に実行する必要がある
-- ============================================================

-- 子タグの名前を「親名:子名」に変更
-- 既にコロンを含む名前は再処理しない
UPDATE tags child
SET name = CONCAT(parent.name, ':', child.name),
    updated_at = NOW()
FROM tags parent
WHERE child.parent_id = parent.id
  AND child.name NOT LIKE '%:%';

-- 子タグだった後に孤立した親タグ（子を持っていた親タグ自体）は
-- そのまま残す（"開発" というタグ名のまま使える）

-- ============================================================
-- Step 2: 複数タグ → 最初の1件だけ残す
-- created_at ASC で最古のものを残す
-- ============================================================

DELETE FROM entry_tags
WHERE id NOT IN (
  SELECT DISTINCT ON (entry_id) id
  FROM entry_tags
  ORDER BY entry_id, created_at ASC, id ASC
);

-- ============================================================
-- Step 3: entry_tags に UNIQUE(entry_id) 制約追加
-- 1エントリ1タグを強制
-- ============================================================

ALTER TABLE entry_tags
  ADD CONSTRAINT entry_tags_entry_id_unique UNIQUE (entry_id);

-- ============================================================
-- Step 4: 階層制約トリガー・関数を削除
-- ============================================================

DROP TRIGGER IF EXISTS enforce_tag_hierarchy ON tags;
DROP TRIGGER IF EXISTS enforce_tag_no_children_as_child ON tags;
DROP FUNCTION IF EXISTS check_tag_hierarchy();
DROP FUNCTION IF EXISTS check_tag_has_children();

-- ============================================================
-- Step 5: parent_id, description カラムとインデックスを削除
-- ============================================================

DROP INDEX IF EXISTS idx_tags_parent_id;
ALTER TABLE tags DROP COLUMN IF EXISTS parent_id;
ALTER TABLE tags DROP COLUMN IF EXISTS description;

-- ============================================================
-- Step 6: get_tag_stats 関数を更新
-- - UNION ALL の untagged 行を削除
-- - plan_count/record_count → entry_count に統合（シンプル化）
-- ============================================================

DROP FUNCTION IF EXISTS get_tag_stats(UUID);

CREATE FUNCTION get_tag_stats(p_user_id UUID)
RETURNS TABLE (
  tag_id UUID,
  entry_count BIGINT,
  last_used TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS tag_id,
    COALESCE(et.cnt, 0) AS entry_count,
    et.last_used AS last_used
  FROM tags t
  LEFT JOIN (
    SELECT
      etag.tag_id,
      COUNT(*) AS cnt,
      MAX(etag.created_at) AS last_used
    FROM entry_tags etag
    GROUP BY etag.tag_id
  ) et ON et.tag_id = t.id
  WHERE t.user_id = p_user_id AND t.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION get_tag_stats(UUID) TO authenticated;

COMMENT ON FUNCTION get_tag_stats(UUID) IS
  'ユーザーのタグ統計（エントリ使用回数・最終使用日）を取得。';

-- ============================================================
-- Step 7: merge_tags 関数を更新
-- parent_id 関連ロジックを削除
-- ============================================================

DROP FUNCTION IF EXISTS merge_tags(UUID, UUID, UUID);

CREATE FUNCTION merge_tags(
  p_user_id UUID,
  p_source_tag_id UUID,
  p_target_tag_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_migrated_entries INT := 0;
  v_source_tag RECORD;
  v_target_tag RECORD;
BEGIN
  -- 権限チェック
  SELECT * INTO v_source_tag FROM tags WHERE id = p_source_tag_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source tag not found or not owned by user';
  END IF;

  SELECT * INTO v_target_tag FROM tags WHERE id = p_target_tag_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target tag not found or not owned by user';
  END IF;

  -- entry_tags のマージ
  -- source → target に付け替え（target が既にある場合は削除）
  DELETE FROM entry_tags
  WHERE tag_id = p_source_tag_id
    AND entry_id IN (
      SELECT entry_id FROM entry_tags WHERE tag_id = p_target_tag_id
    );

  UPDATE entry_tags
  SET tag_id = p_target_tag_id
  WHERE tag_id = p_source_tag_id;

  GET DIAGNOSTICS v_migrated_entries = ROW_COUNT;

  -- ソースタグを無効化
  UPDATE tags SET is_active = false, updated_at = NOW()
  WHERE id = p_source_tag_id;

  RETURN json_build_object(
    'migrated_entries', v_migrated_entries,
    'source_tag_id', p_source_tag_id,
    'target_tag_id', p_target_tag_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_tags(UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION merge_tags(UUID, UUID, UUID) IS
  '2つのタグをマージ。ソースタグのエントリをターゲットに移行し、ソースを無効化。';
