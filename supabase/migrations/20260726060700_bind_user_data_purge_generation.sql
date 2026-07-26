-- Replace the per-operation purge receipt introduced immediately before this
-- migration with an O(1) per-user tuple. The two migrations ship together:
-- no deployed application calls the superseded three-argument v5 signature.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION public.delete_all_user_data_command_v5(TEXT, UUID, UUID);
DROP TABLE private.user_data_purge_operations;

ALTER TABLE private.user_data_controls
  ADD COLUMN last_purge_operation_id UUID,
  ADD COLUMN last_purge_expected_generation BIGINT CHECK (
    last_purge_expected_generation IS NULL
    OR last_purge_expected_generation >= 0
  ),
  ADD COLUMN last_purge_project_key TEXT,
  ADD COLUMN last_purge_completed_at TIMESTAMPTZ,
  ADD CONSTRAINT user_data_controls_last_purge_shape CHECK (
    (
      last_purge_operation_id IS NULL
      AND last_purge_expected_generation IS NULL
      AND last_purge_project_key IS NULL
      AND last_purge_completed_at IS NULL
    )
    OR (
      last_purge_operation_id IS NOT NULL
      AND last_purge_expected_generation IS NOT NULL
      AND last_purge_project_key IS NOT NULL
      AND last_purge_completed_at IS NOT NULL
    )
  );

COMMENT ON COLUMN private.user_data_controls.last_purge_operation_id IS
  'Last completed account-preserving purge operation. Retained only for the account lifetime.';
COMMENT ON COLUMN private.user_data_controls.last_purge_expected_generation IS
  'Generation issued with the last completed purge operation; older operation IDs fail closed.';
COMMENT ON COLUMN private.user_data_controls.last_purge_project_key IS
  'Calendar authority project bound to the last completed purge operation.';
COMMENT ON COLUMN private.user_data_controls.last_purge_completed_at IS
  'Database completion time of the last account-preserving purge.';

CREATE FUNCTION public.prepare_user_data_purge_v1(p_user_id UUID)
RETURNS TABLE (
  operation_id UUID,
  expected_generation BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Purge user identity is required'
      USING ERRCODE = '22004';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  operation_id := gen_random_uuid();
  expected_generation := private.get_user_data_generation_v1(p_user_id);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_user_data_purge_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_user_data_purge_v1(UUID)
  TO service_role;

COMMENT ON FUNCTION public.prepare_user_data_purge_v1(UUID) IS
  'Issues a server-generated purge operation ID with the current user data generation; service role only.';

CREATE FUNCTION public.delete_all_user_data_command_v5(
  p_operation_id UUID,
  p_expected_generation BIGINT,
  p_project_key TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
DECLARE
  v_control private.user_data_controls%ROWTYPE;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_expected_generation IS NULL
    OR p_expected_generation < 0
    OR p_project_key IS NULL
    OR p_user_id IS NULL
  THEN
    RAISE EXCEPTION 'Purge operation identity is required'
      USING ERRCODE = '22004';
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);
  PERFORM private.get_user_data_generation_v1(p_user_id);

  SELECT control.*
  INTO v_control
  FROM private.user_data_controls AS control
  WHERE control.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User data generation is unavailable'
      USING ERRCODE = 'DG001';
  END IF;

  IF v_control.last_purge_operation_id = p_operation_id THEN
    IF v_control.last_purge_expected_generation IS DISTINCT FROM p_expected_generation
      OR v_control.last_purge_project_key IS DISTINCT FROM p_project_key
      OR v_control.last_purge_completed_at IS NULL
    THEN
      RAISE EXCEPTION 'Purge operation identity mismatch'
        USING ERRCODE = 'CA020';
    END IF;

    RETURN TRUE;
  END IF;

  IF v_control.generation IS DISTINCT FROM p_expected_generation THEN
    RAISE EXCEPTION 'User data generation is stale'
      USING ERRCODE = 'DG002';
  END IF;

  PERFORM public.delete_all_user_data_command_v4(
    p_project_key,
    p_user_id
  );

  UPDATE private.user_data_controls AS control
  SET last_purge_operation_id = p_operation_id,
      last_purge_expected_generation = p_expected_generation,
      last_purge_project_key = p_project_key,
      last_purge_completed_at = pg_catalog.clock_timestamp()
  WHERE control.user_id = p_user_id
    AND control.generation = p_expected_generation + 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purge operation completion failed'
      USING ERRCODE = 'CA021';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_all_user_data_command_v5(
  UUID, BIGINT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_user_data_command_v5(
  UUID, BIGINT, TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.delete_all_user_data_command_v5(
  UUID, BIGINT, TEXT, UUID
) IS
  'Replays the last completed purge tuple, rejects stale generations, and never deletes data created after an older operation; service role only.';

COMMIT;
