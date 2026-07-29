-- Make account-preserving deletion replay-safe before the application starts
-- retrying a request whose database response may have been lost. Keep v4
-- executable during the mixed-version deployment window; Step 6 activation
-- closes the superseded entrypoint only after old application instances drain.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.user_data_purge_operations (
  operation_id UUID PRIMARY KEY,
  user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  project_key TEXT NOT NULL
    REFERENCES private.calendar_authority_projects(project_key) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT user_data_purge_operations_completion_order CHECK (
    completed_at IS NULL OR completed_at >= started_at
  )
);

REVOKE ALL ON TABLE private.user_data_purge_operations
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.user_data_purge_operations IS
  'Private account-preserving purge receipts. One operation ID is permanently bound to one user and Calendar authority project so response-loss replay cannot purge newer data.';

CREATE FUNCTION public.delete_all_user_data_command_v5(
  p_operation_id UUID,
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
  v_inserted INTEGER;
  v_operation private.user_data_purge_operations%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_project_key IS NULL
    OR p_user_id IS NULL
  THEN
    RAISE EXCEPTION 'Purge operation identity is required'
      USING ERRCODE = '22004';
  END IF;

  -- The unique row is also the exact operation lock. A concurrent reuse with
  -- different arguments waits for the first transaction, then fails before it
  -- can reach v4. If the first transaction rolls back, the waiter owns a fresh
  -- reservation and may execute the purge.
  INSERT INTO private.user_data_purge_operations (
    operation_id,
    user_id,
    project_key,
    started_at
  ) VALUES (
    p_operation_id,
    p_user_id,
    p_project_key,
    v_now
  )
  ON CONFLICT (operation_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT operation.*
  INTO v_operation
  FROM private.user_data_purge_operations AS operation
  WHERE operation.operation_id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_operation.user_id IS DISTINCT FROM p_user_id
    OR v_operation.project_key IS DISTINCT FROM p_project_key
  THEN
    RAISE EXCEPTION 'Purge operation identity mismatch'
      USING ERRCODE = 'CA020';
  END IF;

  IF v_inserted = 0 THEN
    IF v_operation.completed_at IS NULL THEN
      RAISE EXCEPTION 'Purge operation has no durable completion'
        USING ERRCODE = 'CA021';
    END IF;

    RETURN TRUE;
  END IF;

  PERFORM public.delete_all_user_data_command_v4(
    p_project_key,
    p_user_id
  );

  UPDATE private.user_data_purge_operations AS operation
  SET completed_at = v_now
  WHERE operation.operation_id = p_operation_id
    AND operation.user_id = p_user_id
    AND operation.project_key = p_project_key
    AND operation.completed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purge operation completion failed'
      USING ERRCODE = 'CA021';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_all_user_data_command_v5(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_user_data_command_v5(UUID, TEXT, UUID)
  TO service_role;

COMMENT ON FUNCTION public.delete_all_user_data_command_v5(UUID, TEXT, UUID) IS
  'Replays one account-preserving purge by exact operation ID without advancing generation or deleting data created after its first commit; service role only.';

COMMIT;
