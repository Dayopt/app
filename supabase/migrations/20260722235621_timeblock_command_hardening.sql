-- Close edge cases found while validating the atomic Plan / Record command
-- boundary. This remains an expand migration: authenticated direct writes are
-- removed only after every deployed UI caller has moved to these commands.

-- Refuse to silently preserve a state that the new triggers would reject.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.records AS record
    JOIN public.plans AS plan
      ON plan.id = record.plan_id
      AND plan.user_id = record.user_id
    WHERE record.deleted_at IS NULL
      AND plan.skipped_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Active Records linked to skipped Plans require operator review'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_plan_skipped_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_skipped BOOLEAN
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  IF p_skipped IS NULL THEN
    RAISE EXCEPTION 'Skipped state is required' USING ERRCODE = '22023';
  END IF;

  SELECT plan.* INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = p_user_id
    AND plan.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Plan version conflict' USING ERRCODE = 'DT002';
  END IF;

  IF p_skipped AND v_plan.end_at > pg_catalog.now() THEN
    RAISE EXCEPTION 'Future Plans cannot be skipped' USING ERRCODE = 'DT007';
  END IF;
  IF p_skipped AND EXISTS (
    SELECT 1 FROM public.records AS record
    WHERE record.user_id = p_user_id
      AND record.plan_id = p_plan_id
      AND record.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Plan already has an active Record' USING ERRCODE = 'DT011';
  END IF;

  IF (p_skipped AND v_plan.skipped_at IS NOT NULL)
    OR (NOT p_skipped AND v_plan.skipped_at IS NULL) THEN
    RETURN NEXT v_plan;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.plans
  SET skipped_at = CASE WHEN p_skipped THEN pg_catalog.now() ELSE NULL END
  WHERE id = p_plan_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.plans.*;
END;
$$;

-- Generic create may link a Record to a Plan, but only the dedicated
-- record_plan command may claim the from_plan provenance.
CREATE OR REPLACE FUNCTION public.create_record_command_v1(
  p_user_id UUID,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_plan_id UUID,
  p_external_calendar_event_id UUID,
  p_source TEXT,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  PERFORM public.assert_timeblock_external_event_v1(
    p_user_id,
    p_external_calendar_event_id
  );
  IF p_plan_id IS NOT NULL THEN
    PERFORM public.lock_recordable_plan_v1(p_user_id, p_plan_id);
  END IF;

  IF p_source IS NULL
    OR p_source <> ALL (ARRAY['manual', 'external_calendar', 'api']::TEXT[])
    OR ((p_source = 'external_calendar') IS DISTINCT FROM
        (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Record source shape' USING ERRCODE = 'DT012';
  END IF;

  RETURN QUERY
  INSERT INTO public.records (
    user_id, title, note, tag_id, plan_id, external_calendar_event_id,
    source, start_at, end_at
  ) VALUES (
    p_user_id, p_title, p_note, p_tag_id, p_plan_id,
    p_external_calendar_event_id, p_source, p_start_at, p_end_at
  )
  RETURNING public.records.*;
END;
$$;

-- Existing Record mutations use Record -> Plan lock order. This matches the
-- direct UPDATE path during rolling deployment, where PostgreSQL owns the row
-- lock before the linked-Plan trigger executes.
CREATE OR REPLACE FUNCTION public.update_record_command_v1(
  p_user_id UUID,
  p_record_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_plan_id UUID,
  p_external_calendar_event_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_record public.records%ROWTYPE;
BEGIN
  SELECT record.* INTO v_record
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_record.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Record version conflict' USING ERRCODE = 'DT002';
  END IF;
  IF v_record.source = 'auto_migrated' THEN
    RAISE EXCEPTION 'Migrated Record is immutable' USING ERRCODE = 'DT009';
  END IF;
  IF v_record.source = 'from_plan' AND p_plan_id IS NULL THEN
    RAISE EXCEPTION 'from_plan Record requires a Plan' USING ERRCODE = 'DT012';
  END IF;
  IF ((v_record.source = 'external_calendar') IS DISTINCT FROM
      (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Record source shape' USING ERRCODE = 'DT012';
  END IF;

  IF p_plan_id IS DISTINCT FROM v_record.plan_id AND p_plan_id IS NOT NULL THEN
    PERFORM public.lock_recordable_plan_v1(p_user_id, p_plan_id);
  END IF;

  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  IF p_tag_id IS DISTINCT FROM v_record.tag_id THEN
    PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  END IF;
  IF p_external_calendar_event_id IS DISTINCT FROM v_record.external_calendar_event_id THEN
    PERFORM public.assert_timeblock_external_event_v1(
      p_user_id,
      p_external_calendar_event_id
    );
  END IF;

  IF ROW(
    p_title,
    p_note,
    p_tag_id,
    p_plan_id,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at
  ) IS NOT DISTINCT FROM ROW(
    v_record.title,
    v_record.note,
    v_record.tag_id,
    v_record.plan_id,
    v_record.external_calendar_event_id,
    v_record.start_at,
    v_record.end_at
  ) THEN
    RETURN NEXT v_record;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.records
  SET title = p_title,
      note = p_note,
      tag_id = p_tag_id,
      plan_id = p_plan_id,
      external_calendar_event_id = p_external_calendar_event_id,
      start_at = p_start_at,
      end_at = p_end_at
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.records.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_record_command_v1(
  p_user_id UUID,
  p_record_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_record public.records%ROWTYPE;
BEGIN
  SELECT record.* INTO v_record
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_record.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Record version conflict' USING ERRCODE = 'DT002';
  END IF;
  IF v_record.source = 'auto_migrated' THEN
    RAISE EXCEPTION 'Migrated Record is immutable' USING ERRCODE = 'DT009';
  END IF;
  IF v_record.plan_id IS NOT NULL THEN
    PERFORM public.lock_recordable_plan_v1(p_user_id, v_record.plan_id);
  END IF;

  RETURN QUERY
  UPDATE public.records
  SET deleted_at = NULL
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NOT NULL
  RETURNING public.records.*;
END;
$$;

-- Tag merge takes deterministic row locks before scanning associations. A
-- concurrent command either commits its new reference before the scan or sees
-- the source tag inactive after the merge.
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
  v_children_count INTEGER := 0;
  v_next_sort_order INTEGER;
  v_locked_tag_count INTEGER := 0;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied: service role required' USING ERRCODE = '42501';
  END IF;

  IF p_source_tag_id = p_target_tag_id THEN
    RAISE EXCEPTION 'Cannot merge a tag with itself' USING ERRCODE = 'P0001';
  END IF;

  PERFORM tag.id
  FROM public.tags AS tag
  WHERE tag.user_id = p_user_id
    AND tag.id = ANY (ARRAY[p_source_tag_id, p_target_tag_id]::UUID[])
    AND tag.is_active
  ORDER BY tag.id
  FOR UPDATE;
  GET DIAGNOSTICS v_locked_tag_count = ROW_COUNT;

  IF v_locked_tag_count <> 2 THEN
    RAISE EXCEPTION 'Source or target tag not found or inactive'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT tag.parent_id INTO v_target_parent_id
  FROM public.tags AS tag
  WHERE tag.id = p_target_tag_id
    AND tag.user_id = p_user_id
    AND tag.is_active;

  SELECT COUNT(*) INTO v_children_count
  FROM public.tags AS tag
  WHERE tag.user_id = p_user_id
    AND tag.parent_id = p_source_tag_id
    AND tag.is_active;

  IF v_children_count > 0 AND v_target_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot merge a parent tag into a child tag.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.plans
  SET tag_id = p_target_tag_id
  WHERE user_id = p_user_id AND tag_id = p_source_tag_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_migrated_count := v_migrated_count + v_row_count;

  UPDATE public.records
  SET tag_id = p_target_tag_id
  WHERE user_id = p_user_id AND tag_id = p_source_tag_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_migrated_count := v_migrated_count + v_row_count;

  IF v_children_count > 0 THEN
    SELECT COALESCE(MAX(tag.sort_order), -1) + 1 INTO v_next_sort_order
    FROM public.tags AS tag
    WHERE tag.user_id = p_user_id AND tag.parent_id = p_target_tag_id;

    UPDATE public.tags AS tag
    SET parent_id = p_target_tag_id,
        sort_order = v_next_sort_order + children.idx,
        updated_at = pg_catalog.now()
    FROM (
      SELECT child.id,
             (ROW_NUMBER() OVER (ORDER BY child.sort_order, child.id) - 1)::INTEGER AS idx
      FROM public.tags AS child
      WHERE child.user_id = p_user_id
        AND child.parent_id = p_source_tag_id
        AND child.is_active
    ) AS children
    WHERE tag.id = children.id AND tag.user_id = p_user_id;
  END IF;

  UPDATE public.tags
  SET is_active = false, updated_at = pg_catalog.now()
  WHERE id = p_source_tag_id AND user_id = p_user_id;

  RETURN pg_catalog.json_build_object(
    'migrated', v_migrated_count,
    'children_reparented', v_children_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_plan_skipped_command_v1(
  UUID, UUID, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_record_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_record_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_plan_skipped_command_v1(
  UUID, UUID, TIMESTAMPTZ, BOOLEAN
) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_record_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_record_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
