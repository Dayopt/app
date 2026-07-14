-- Issue #1564: separate authenticated SECURITY INVOKER RPCs from
-- service-role-only SECURITY DEFINER RPCs and close cross-user paths.

-- Production drift: this obsolete overload references tables removed from the
-- repository schema. It is intentionally absent in local databases.
DROP FUNCTION IF EXISTS public.merge_tags(UUID, UUID[], UUID);

-- Refuse to apply over existing cross-user tag hierarchy drift. Repair, if ever
-- needed, must be reviewed separately instead of being hidden in this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tags AS child
    JOIN public.tags AS parent ON parent.id = child.parent_id
    WHERE child.user_id IS DISTINCT FROM parent.user_id
  ) THEN
    RAISE EXCEPTION 'Cannot harden tag hierarchy while cross-user parent relationships exist'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_tag_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_parent_user_id UUID;
  v_grandparent_id UUID;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'A tag cannot be its own parent.';
    END IF;

    SELECT parent.user_id, parent.parent_id
    INTO v_parent_user_id, v_grandparent_id
    FROM public.tags AS parent
    WHERE parent.id = NEW.parent_id;

    IF NOT FOUND OR v_parent_user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Parent tag must belong to the same user.'
        USING ERRCODE = '23514';
    END IF;

    IF v_grandparent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Maximum nesting depth is 1 level. Parent tag cannot be a child of another tag.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Authenticated callers execute these with their own RLS context. The explicit
-- user guard also preserves the existing service-role server path.
CREATE OR REPLACE FUNCTION public.batch_rename_tags(
  p_user_id UUID,
  p_tag_ids UUID[],
  p_new_names TEXT[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  updated_count INT;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  IF array_length(p_tag_ids, 1) IS DISTINCT FROM array_length(p_new_names, 1) THEN
    RAISE EXCEPTION 'tag_ids and new_names must have the same length';
  END IF;

  UPDATE public.tags
  SET name = batch.new_name,
      updated_at = pg_catalog.now()
  FROM unnest(p_tag_ids, p_new_names) AS batch(tag_id, new_name)
  WHERE public.tags.id = batch.tag_id
    AND public.tags.user_id = p_user_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.batch_reorder_tags_hierarchy(
  p_user_id UUID,
  p_tag_ids UUID[],
  p_parent_ids UUID[],
  p_sort_orders INT[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  updated_count INT;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  IF array_length(p_tag_ids, 1) IS DISTINCT FROM array_length(p_parent_ids, 1)
     OR array_length(p_tag_ids, 1) IS DISTINCT FROM array_length(p_sort_orders, 1) THEN
    RAISE EXCEPTION 'tag_ids, parent_ids and sort_orders must have the same length';
  END IF;

  UPDATE public.tags
  SET parent_id = batch.parent_id,
      sort_order = batch.new_order,
      updated_at = pg_catalog.now()
  FROM unnest(p_tag_ids, p_parent_ids, p_sort_orders) AS batch(tag_id, parent_id, new_order)
  WHERE public.tags.id = batch.tag_id
    AND public.tags.user_id = p_user_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_tag_group(
  p_user_id UUID,
  p_old_prefix TEXT,
  p_new_prefix TEXT
)
RETURNS SETOF public.tags
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  UPDATE public.tags
  SET name = p_new_prefix || substring(name FROM length(p_old_prefix) + 1),
      updated_at = pg_catalog.now()
  WHERE user_id = p_user_id
    AND starts_with(name, p_old_prefix || ':')
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_day_plans_to_records(
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_confirmed_at TIMESTAMPTZ DEFAULT pg_catalog.now()
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_confirmed_at CONSTANT TIMESTAMPTZ := LEAST(
    COALESCE(p_confirmed_at, pg_catalog.now()),
    pg_catalog.now()
  );
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'confirm day range end must be after start'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH target_plans AS (
    SELECT p.*
    FROM public.plans AS p
    WHERE p.user_id = p_user_id
      AND p.deleted_at IS NULL
      AND p.skipped_at IS NULL
      AND p.end_at <= v_confirmed_at
      AND p.start_at >= p_start_at
      AND p.start_at < p_end_at
      AND NOT EXISTS (
        SELECT 1
        FROM public.records AS r
        WHERE r.plan_id = p.id AND r.deleted_at IS NULL
      )
    ORDER BY p.start_at, p.id
  )
  INSERT INTO public.records (
    user_id, tag_id, plan_id, external_calendar_event_id, title, note,
    start_at, end_at, source, created_at, updated_at
  )
  SELECT
    p.user_id, p.tag_id, p.id, NULL, p.title, p.note,
    p.start_at, p.end_at, 'from_plan', v_confirmed_at, v_confirmed_at
  FROM target_plans AS p
  RETURNING public.records.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_unused_recovery_codes(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.mfa_recovery_codes
  WHERE user_id = p_user_id AND used_at IS NULL;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_personalization(
  p_user_id UUID,
  p_path TEXT,
  p_value JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  UPDATE public.user_settings
  SET personalization = CASE
    WHEN personalization IS NULL THEN pg_catalog.jsonb_build_object(p_path, p_value)
    ELSE pg_catalog.jsonb_set(personalization, ARRAY[p_path], p_value, true)
  END,
  updated_at = pg_catalog.now()
  WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_plan(p_plan_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  UPDATE public.plans
  SET deleted_at = pg_catalog.now()
  WHERE id = p_plan_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or already deleted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_record(p_record_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  UPDATE public.records
  SET deleted_at = pg_catalog.now()
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
    AND source IS DISTINCT FROM 'auto_migrated';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found, already deleted, or protected';
  END IF;
END;
$$;

-- These operations must see rows hidden by normal SELECT RLS. They retain
-- SECURITY DEFINER but require the service-role JWT and always scope by user.
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
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied: service role required' USING ERRCODE = '42501';
  END IF;

  IF p_source_tag_id = p_target_tag_id THEN
    RAISE EXCEPTION 'Cannot merge a tag with itself' USING ERRCODE = 'P0001';
  END IF;

  SELECT parent_id INTO v_target_parent_id
  FROM public.tags
  WHERE id = p_target_tag_id AND user_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target tag not found or inactive: %', p_target_tag_id
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.tags
  WHERE id = p_source_tag_id AND user_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source tag not found or inactive: %', p_source_tag_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO v_children_count
  FROM public.tags
  WHERE user_id = p_user_id AND parent_id = p_source_tag_id AND is_active = true;

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
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_next_sort_order
    FROM public.tags
    WHERE user_id = p_user_id AND parent_id = p_target_tag_id;

    UPDATE public.tags AS tag
    SET parent_id = p_target_tag_id,
        sort_order = v_next_sort_order + children.idx,
        updated_at = pg_catalog.now()
    FROM (
      SELECT id, (ROW_NUMBER() OVER (ORDER BY sort_order, id) - 1)::INTEGER AS idx
      FROM public.tags
      WHERE user_id = p_user_id
        AND parent_id = p_source_tag_id
        AND is_active = true
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

CREATE OR REPLACE FUNCTION public.restore_plan(p_plan_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied: service role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.plans
  SET deleted_at = NULL
  WHERE id = p_plan_id AND user_id = p_user_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or not deleted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_record(p_record_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied: service role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.records
  SET deleted_at = NULL
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NOT NULL
    AND source IS DISTINCT FROM 'auto_migrated';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found, not deleted, or protected';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.use_recovery_code(p_user_id UUID, p_code_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code_id UUID;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied: service role required' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_code_id
  FROM public.mfa_recovery_codes
  WHERE user_id = p_user_id AND code_hash = p_code_hash AND used_at IS NULL;

  IF v_code_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.mfa_recovery_codes
  SET used_at = pg_catalog.now()
  WHERE id = v_code_id AND user_id = p_user_id;

  RETURN true;
END;
$$;

-- Explicit ACLs avoid PostgreSQL's default PUBLIC EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.batch_rename_tags(UUID, UUID[], TEXT[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.batch_reorder_tags_hierarchy(UUID, UUID[], UUID[], INT[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rename_tag_group(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_day_plans_to_records(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.count_unused_recovery_codes(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_personalization(UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_plan(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_record(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.batch_rename_tags(UUID, UUID[], TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.batch_reorder_tags_hierarchy(UUID, UUID[], UUID[], INT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rename_tag_group(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_day_plans_to_records(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_unused_recovery_codes(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_personalization(UUID, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_plan(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_record(UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_plan(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_record(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.use_recovery_code(UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_plan(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_record(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.use_recovery_code(UUID, TEXT) TO service_role;
