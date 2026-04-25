-- merge_tags_with_hierarchy: SECURITY DEFINER の IDOR ガードを追加
--
-- 経緯:
--   20260425100000_atomic_merge_tags_with_hierarchy.sql で導入した
--   merge_tags_with_hierarchy は SECURITY DEFINER で authenticated に GRANT して
--   いるが、`p_user_id != auth.uid()` のチェックを忘れており、他ユーザーの UUID を
--   渡すと entries / tags が破壊的にマージできる IDOR 経路があった。
--
-- 既存の hardened definer RPC (20260317022728_fix_security_definer_idor.sql) と
-- 同じパターンで `auth.uid()` ガードを先頭に追加する。

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
  -- IDOR ガード: 他ユーザーの user_id を指定して破壊的マージできないようにする
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

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
