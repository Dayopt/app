-- merge_tags関数を修正: ソースタグ削除前に子タグをルートに昇格
-- 既存の関数を置き換え（CREATE OR REPLACE）

CREATE OR REPLACE FUNCTION merge_tags(
  p_user_id uuid,
  p_source_tag_ids uuid[],
  p_target_tag_id uuid
) RETURNS json AS $$
DECLARE
  source_tag_id uuid;
  merged_count integer := 0;
  deleted_count integer := 0;
  promoted_count integer := 0;
  row_affected integer := 0;
  target_tag tags;
  result json;
BEGIN
  -- 1. ターゲットタグの存在確認
  SELECT * INTO target_tag FROM tags
  WHERE id = p_target_tag_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target tag not found: %', p_target_tag_id;
  END IF;

  -- 2. 各ソースタグを処理
  FOREACH source_tag_id IN ARRAY p_source_tag_ids LOOP
    -- ソースタグの存在確認
    IF NOT EXISTS (
      SELECT 1 FROM tags WHERE id = source_tag_id AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'Source tag not found: %', source_tag_id;
    END IF;

    -- 同じタグへのマージは不可
    IF source_tag_id = p_target_tag_id THEN
      RAISE EXCEPTION 'Cannot merge a tag with itself: %', source_tag_id;
    END IF;

    -- plan_tags を更新（重複しないもののみ）
    UPDATE plan_tags
    SET tag_id = p_target_tag_id
    WHERE user_id = p_user_id
      AND tag_id = source_tag_id
      AND NOT EXISTS (
        SELECT 1 FROM plan_tags pt
        WHERE pt.user_id = p_user_id
          AND pt.plan_id = plan_tags.plan_id
          AND pt.tag_id = p_target_tag_id
      );

    GET DIAGNOSTICS merged_count = ROW_COUNT;

    -- 重複していた関連付けを削除
    DELETE FROM plan_tags
    WHERE user_id = p_user_id AND tag_id = source_tag_id;

    -- ★追加: ソースタグの子タグをルートに昇格（parent_id = NULL）
    UPDATE tags
    SET parent_id = NULL, updated_at = NOW()
    WHERE user_id = p_user_id AND parent_id = source_tag_id;

    GET DIAGNOSTICS row_affected = ROW_COUNT;
    promoted_count := promoted_count + row_affected;

    -- ソースタグを削除
    DELETE FROM tags WHERE id = source_tag_id AND user_id = p_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  END LOOP;

  -- 3. 結果をJSONで返す
  SELECT json_build_object(
    'success', true,
    'merged_associations', merged_count,
    'deleted_tags', deleted_count,
    'promoted_children', promoted_count,
    'target_tag', row_to_json(target_tag)
  ) INTO result;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    -- 全操作ロールバック
    RAISE EXCEPTION 'Failed to merge tags: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 関数の説明を更新
COMMENT ON FUNCTION merge_tags IS
  'Atomically merges multiple source tags into a target tag, migrating associations, promoting child tags to root, and deleting source tags.';
