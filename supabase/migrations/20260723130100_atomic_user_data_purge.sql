-- Complete the same-user serialization boundary with atomic Settings purges,
-- tag deletion commands, and account-deletion participation.

-- =============================================================================
-- 1. Parent-first lock order shared by browser, MCP, purge, and account delete
-- =============================================================================

CREATE OR REPLACE FUNCTION private.lock_timeblock_user_write_shared_v1(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Timeblock user lock requires a user id'
      USING ERRCODE = '22004';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timeblock user not found'
      USING ERRCODE = 'DT001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      'dayopt:timeblock-user-write:' || p_user_id::TEXT,
      6182714039157042
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.lock_timeblock_user_write_exclusive_v1(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Timeblock user lock requires a user id'
      USING ERRCODE = '22004';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timeblock user not found'
      USING ERRCODE = 'DT001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dayopt:timeblock-user-write:' || p_user_id::TEXT,
      6182714039157042
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.lock_timeblock_user_write_shared_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.lock_timeblock_user_write_exclusive_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.lock_timeblock_user_before_account_delete_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
BEGIN
  PERFORM private.lock_timeblock_user_write_exclusive_v1(OLD.id);
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.lock_timeblock_user_before_account_delete_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trigger_lock_timeblock_user_before_account_delete
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.lock_timeblock_user_before_account_delete_v1();

-- =============================================================================
-- 2. Atomic tag deletion and association strategy
-- =============================================================================

CREATE FUNCTION public.delete_tags_with_timeblocks_command_v1(
  p_user_id UUID,
  p_tag_ids UUID[],
  p_strategy TEXT,
  p_target_tag_id UUID
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
  v_plan_ids UUID[];
  v_locked_tag_count INTEGER := 0;
  v_deleted_tag_count INTEGER := 0;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

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
    OR p_strategy <> ALL (ARRAY['reassign', 'delete_blocks']::TEXT[]) THEN
    RAISE EXCEPTION 'Unsupported tag deletion strategy'
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

  IF p_strategy = 'reassign' THEN
    UPDATE public.plans
    SET tag_id = p_target_tag_id
    WHERE user_id = p_user_id
      AND tag_id = ANY (v_tag_ids);

    UPDATE public.records
    SET tag_id = p_target_tag_id
    WHERE user_id = p_user_id
      AND tag_id = ANY (v_tag_ids);
  ELSE
    SELECT COALESCE(
      pg_catalog.array_agg(candidate.id ORDER BY candidate.id),
      ARRAY[]::UUID[]
    )
    INTO v_plan_ids
    FROM (
      SELECT plan.id
      FROM public.plans AS plan
      WHERE plan.user_id = p_user_id
        AND plan.tag_id = ANY (v_tag_ids)
      ORDER BY plan.id
      FOR UPDATE
    ) AS candidate;

    DELETE FROM public.records
    WHERE user_id = p_user_id
      AND tag_id = ANY (v_tag_ids);

    IF pg_catalog.cardinality(v_plan_ids) > 0 THEN
      UPDATE public.records
      SET plan_id = NULL
      WHERE user_id = p_user_id
        AND plan_id = ANY (v_plan_ids);
    END IF;

    DELETE FROM public.plans
    WHERE user_id = p_user_id
      AND id = ANY (v_plan_ids);
  END IF;

  DELETE FROM public.tags
  WHERE user_id = p_user_id
    AND id = ANY (v_tag_ids);
  GET DIAGNOSTICS v_deleted_tag_count = ROW_COUNT;

  IF v_deleted_tag_count <> pg_catalog.cardinality(v_tag_ids) THEN
    RAISE EXCEPTION 'Tag deletion conflict'
      USING ERRCODE = 'DT002';
  END IF;

  RETURN v_deleted_tag_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_tags_with_timeblocks_command_v1(
  UUID, UUID[], TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tags_with_timeblocks_command_v1(
  UUID, UUID[], TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.delete_tags_with_timeblocks_command_v1(
  UUID, UUID[], TEXT, UUID
) IS 'Atomically applies the tag association strategy and deletes source tags under the same-user shared timeblock lock; service role only.';

-- =============================================================================
-- 3. Atomic Settings purge commands
-- =============================================================================

CREATE FUNCTION public.delete_user_timeblocks_command_v1(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_row_count INTEGER := 0;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  DELETE FROM public.records
  WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_deleted := v_deleted + v_row_count;

  DELETE FROM public.plans
  WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_deleted := v_deleted + v_row_count;

  RETURN v_deleted;
END;
$$;

CREATE FUNCTION public.delete_all_user_data_command_v1(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  DELETE FROM public.records
  WHERE user_id = p_user_id;

  DELETE FROM public.plans
  WHERE user_id = p_user_id;

  DELETE FROM public.tags
  WHERE user_id = p_user_id;

  DELETE FROM public.user_settings
  WHERE user_id = p_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_timeblocks_command_v1(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_all_user_data_command_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_timeblocks_command_v1(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_all_user_data_command_v1(UUID)
  TO service_role;

COMMENT ON FUNCTION public.delete_user_timeblocks_command_v1(UUID) IS
  'Atomically deletes one user''s Plans and Records under an exclusive transaction lock; service role only.';
COMMENT ON FUNCTION public.delete_all_user_data_command_v1(UUID) IS
  'Atomically deletes one user''s Plans, Records, tags, and settings under an exclusive transaction lock; service role only.';

-- Retire the remaining pre-command service-role recovery writers.
REVOKE EXECUTE ON FUNCTION public.restore_plan(UUID, UUID) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.restore_record(UUID, UUID) FROM service_role;

