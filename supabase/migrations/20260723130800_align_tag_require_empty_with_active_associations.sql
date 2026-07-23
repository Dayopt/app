-- Match the application's association preflight: soft-deleted Plans and Records
-- are trash, not active associations. Once the active check passes, the
-- existing delete_blocks implementation still hard-deletes trash rows together
-- with the tag, preserving the pre-command behavior.

CREATE OR REPLACE FUNCTION public.delete_tags_with_timeblocks_command_v2(
  p_user_id UUID,
  p_tag_ids UUID[],
  p_strategy TEXT,
  p_target_tag_id UUID,
  p_promote_children BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_tag_ids UUID[];
  v_lock_tag_ids UUID[];
  v_locked_tag_count INTEGER := 0;
  v_effective_strategy TEXT;
  v_source_tag_id UUID;
  v_next_root_sort_order INTEGER;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  SELECT pg_catalog.array_agg(candidate.tag_id ORDER BY candidate.tag_id)
  INTO v_tag_ids
  FROM (
    SELECT DISTINCT input_tag.tag_id
    FROM pg_catalog.unnest(p_tag_ids) AS input_tag(tag_id)
    WHERE input_tag.tag_id IS NOT NULL
  ) AS candidate;

  IF COALESCE(pg_catalog.cardinality(v_tag_ids), 0) = 0 THEN
    RAISE EXCEPTION 'At least one tag is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_strategy IS NULL
    OR p_strategy <> ALL (ARRAY['require_empty', 'reassign', 'delete_blocks']::TEXT[]) THEN
    RAISE EXCEPTION 'Unsupported tag deletion strategy'
      USING ERRCODE = '22023';
  END IF;

  IF p_promote_children IS NULL THEN
    RAISE EXCEPTION 'Child promotion choice is required'
      USING ERRCODE = '22004';
  END IF;

  IF p_promote_children AND pg_catalog.cardinality(v_tag_ids) <> 1 THEN
    RAISE EXCEPTION 'Child promotion requires exactly one source tag'
      USING ERRCODE = '22023';
  END IF;

  IF p_strategy = 'reassign' THEN
    IF p_target_tag_id IS NULL OR p_target_tag_id = ANY (v_tag_ids) THEN
      RAISE EXCEPTION 'A different target tag is required for reassignment'
        USING ERRCODE = '22023';
    END IF;

    SELECT pg_catalog.array_agg(candidate.tag_id ORDER BY candidate.tag_id)
    INTO v_lock_tag_ids
    FROM (
      SELECT DISTINCT input_tag.tag_id
      FROM pg_catalog.unnest(v_tag_ids || ARRAY[p_target_tag_id]::UUID[]) AS input_tag(tag_id)
    ) AS candidate;
  ELSE
    v_lock_tag_ids := v_tag_ids;
  END IF;

  PERFORM tag.id
  FROM public.tags AS tag
  WHERE tag.user_id = p_user_id
    AND tag.id = ANY (v_lock_tag_ids)
  ORDER BY tag.id
  FOR UPDATE;
  GET DIAGNOSTICS v_locked_tag_count = ROW_COUNT;

  IF v_locked_tag_count <> pg_catalog.cardinality(v_lock_tag_ids) THEN
    RAISE EXCEPTION 'Tag not found'
      USING ERRCODE = 'DT001';
  END IF;

  IF p_strategy = 'reassign'
    AND NOT EXISTS (
      SELECT 1
      FROM public.tags AS target
      WHERE target.id = p_target_tag_id
        AND target.user_id = p_user_id
        AND target.is_active
    ) THEN
    RAISE EXCEPTION 'Target tag not found'
      USING ERRCODE = 'DT001';
  END IF;

  IF p_strategy = 'require_empty'
    AND (
      EXISTS (
        SELECT 1
        FROM public.plans AS plan
        WHERE plan.user_id = p_user_id
          AND plan.tag_id = ANY (v_tag_ids)
          AND plan.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public.records AS record
        WHERE record.user_id = p_user_id
          AND record.tag_id = ANY (v_tag_ids)
          AND record.deleted_at IS NULL
      )
    ) THEN
    RAISE EXCEPTION 'Tag has associated timeblocks'
      USING ERRCODE = 'DT014';
  END IF;

  IF p_promote_children THEN
    v_source_tag_id := v_tag_ids[1];

    PERFORM tag.id
    FROM public.tags AS tag
    WHERE tag.user_id = p_user_id
      AND tag.is_active
      AND (tag.parent_id = v_source_tag_id OR tag.parent_id IS NULL)
    ORDER BY tag.id
    FOR UPDATE;

    SELECT COALESCE(MAX(tag.sort_order), -1) + 1
    INTO v_next_root_sort_order
    FROM public.tags AS tag
    WHERE tag.user_id = p_user_id
      AND tag.parent_id IS NULL;

    UPDATE public.tags AS tag
    SET parent_id = NULL,
        sort_order = v_next_root_sort_order + children.position,
        updated_at = pg_catalog.now()
    FROM (
      SELECT
        child.id,
        (ROW_NUMBER() OVER (ORDER BY child.sort_order, child.id) - 1)::INTEGER AS position
      FROM public.tags AS child
      WHERE child.user_id = p_user_id
        AND child.parent_id = v_source_tag_id
        AND child.is_active
    ) AS children
    WHERE tag.id = children.id
      AND tag.user_id = p_user_id;
  END IF;

  v_effective_strategy := CASE
    WHEN p_strategy = 'require_empty' THEN 'delete_blocks'
    ELSE p_strategy
  END;

  RETURN private.delete_tags_with_timeblocks_shared_v1(
    p_user_id,
    v_tag_ids,
    v_effective_strategy,
    p_target_tag_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_tags_with_timeblocks_command_v2(
  UUID, UUID[], TEXT, UUID, BOOLEAN
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.delete_tags_with_timeblocks_command_v2(
  UUID, UUID[], TEXT, UUID, BOOLEAN
) IS 'Atomically rejects active associations, promotes children when requested, and deletes the tag plus any trash-only timeblocks under an exclusive same-user lock.';
