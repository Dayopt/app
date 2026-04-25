-- merge_tags_with_hierarchy: parent_id 階層に対応した atomic タグマージ RPC
--
-- 経緯:
--   parent_id 階層復活 (20260424000000_restore_tag_parent_hierarchy.sql) に伴い、
--   タグマージは「entries 移動 + children 再 parent + source 非アクティブ化」の
--   3 ステップになった。既存 `merge_tags` RPC は children 再 parent をサポートして
--   いないため、TS 側で 3 ステップを sequential 実行していた。
--   結果として途中で fail すると partial state が残る P1 atomicity 課題があった。
--
-- このマイグレーションでは 3 ステップを 1 つの PL/pgSQL 関数に集約する。
-- PostgreSQL では関数内の例外は自動的に rollback されるため、いずれかの UPDATE が
-- 失敗すれば全体が rollback され partial state は発生しない。

CREATE OR REPLACE FUNCTION public.merge_tags_with_hierarchy(
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
  v_migrated_count INTEGER := 0;
  v_target_parent_id UUID;
  v_target_exists BOOLEAN;
  v_source_exists BOOLEAN;
  v_children_count INTEGER := 0;
  v_next_sort_order INTEGER;
BEGIN
  IF p_source_tag_id = p_target_tag_id THEN
    RAISE EXCEPTION 'Cannot merge a tag with itself' USING ERRCODE = 'P0001';
  END IF;

  -- target tag の存在確認 + parent_id 取得
  SELECT TRUE, parent_id INTO v_target_exists, v_target_parent_id
  FROM public.tags
  WHERE id = p_target_tag_id
    AND user_id = p_user_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target tag not found or inactive: %', p_target_tag_id
      USING ERRCODE = 'P0002';
  END IF;

  -- source tag の存在確認
  SELECT TRUE INTO v_source_exists
  FROM public.tags
  WHERE id = p_source_tag_id
    AND user_id = p_user_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source tag not found or inactive: %', p_source_tag_id
      USING ERRCODE = 'P0002';
  END IF;

  -- source の active children をカウント
  SELECT COUNT(*) INTO v_children_count
  FROM public.tags
  WHERE user_id = p_user_id
    AND parent_id = p_source_tag_id
    AND is_active = true;

  -- 親タグを子タグにマージしようとしている場合は弾く
  IF v_children_count > 0 AND v_target_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot merge a parent tag into a child tag.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 1. entries の tag_id を source → target に移動
  UPDATE public.entries
  SET tag_id = p_target_tag_id
  WHERE user_id = p_user_id
    AND tag_id = p_source_tag_id;

  GET DIAGNOSTICS v_migrated_count = ROW_COUNT;

  -- 2. children を target の下に reparent (sort_order を target 配下の末尾に追加)
  IF v_children_count > 0 THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1
    INTO v_next_sort_order
    FROM public.tags
    WHERE user_id = p_user_id AND parent_id = p_target_tag_id;

    UPDATE public.tags AS t
    SET parent_id = p_target_tag_id,
        sort_order = v_next_sort_order + sub.idx,
        updated_at = NOW()
    FROM (
      SELECT id, (ROW_NUMBER() OVER (ORDER BY sort_order, id) - 1)::INTEGER AS idx
      FROM public.tags
      WHERE user_id = p_user_id
        AND parent_id = p_source_tag_id
        AND is_active = true
    ) sub
    WHERE t.id = sub.id AND t.user_id = p_user_id;
  END IF;

  -- 3. source を非アクティブ化
  UPDATE public.tags
  SET is_active = false, updated_at = NOW()
  WHERE id = p_source_tag_id AND user_id = p_user_id;

  RETURN json_build_object(
    'migrated', v_migrated_count,
    'children_reparented', v_children_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID) IS
  'parent_id 階層に対応した atomic タグマージ。entries 移動 + children 再 parent + source 非アクティブ化を 1 transaction で実行。';
