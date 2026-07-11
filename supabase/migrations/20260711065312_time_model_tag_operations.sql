-- time-model-split Step 8: atomic tag merge の移行対象を entries から
-- plans / logs へ拡張する。entries は Step 9 まで互換のため併記する。

CREATE OR REPLACE FUNCTION public.merge_tags_with_hierarchy(
  p_user_id UUID,
  p_source_tag_id UUID,
  p_target_tag_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_migrated_count INTEGER := 0;
  v_row_count INTEGER := 0;
  v_target_parent_id UUID;
  v_target_exists BOOLEAN;
  v_source_exists BOOLEAN;
  v_children_count INTEGER := 0;
  v_next_sort_order INTEGER;
BEGIN
  IF p_user_id != (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  IF p_source_tag_id = p_target_tag_id THEN
    RAISE EXCEPTION 'Cannot merge a tag with itself' USING ERRCODE = 'P0001';
  END IF;

  SELECT TRUE, parent_id INTO v_target_exists, v_target_parent_id
  FROM public.tags
  WHERE id = p_target_tag_id
    AND user_id = p_user_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target tag not found or inactive: %', p_target_tag_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT TRUE INTO v_source_exists
  FROM public.tags
  WHERE id = p_source_tag_id
    AND user_id = p_user_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source tag not found or inactive: %', p_source_tag_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO v_children_count
  FROM public.tags
  WHERE user_id = p_user_id
    AND parent_id = p_source_tag_id
    AND is_active = true;

  IF v_children_count > 0 AND v_target_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot merge a parent tag into a child tag.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.plans
  SET tag_id = p_target_tag_id
  WHERE user_id = p_user_id
    AND tag_id = p_source_tag_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_migrated_count := v_migrated_count + v_row_count;

  UPDATE public.logs
  SET tag_id = p_target_tag_id
  WHERE user_id = p_user_id
    AND tag_id = p_source_tag_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_migrated_count := v_migrated_count + v_row_count;

  UPDATE public.entries
  SET tag_id = p_target_tag_id
  WHERE user_id = p_user_id
    AND tag_id = p_source_tag_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_migrated_count := v_migrated_count + v_row_count;

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

  UPDATE public.tags
  SET is_active = false, updated_at = NOW()
  WHERE id = p_source_tag_id AND user_id = p_user_id;

  RETURN json_build_object(
    'migrated', v_migrated_count,
    'children_reparented', v_children_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID)
  TO authenticated;
