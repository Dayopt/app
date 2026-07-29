-- Direct Plan/Record writers take the global direct-write lock before their
-- auth.users foreign-key lock. Account-deletion begin must take the matching
-- supported global lock first, or the two paths can deadlock.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.begin_account_deletion_v1(p_user_id UUID)
RETURNS TABLE (
  deletion_id UUID,
  calendar_state TEXT,
  storage_state TEXT,
  billing_state TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_operation private.account_deletion_operations%ROWTYPE;
  v_deletion_id UUID;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.assert_account_deletion_gate_active_v1();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Account deletion user identity is required'
      USING ERRCODE = '22004';
  END IF;

  -- Match every timeblock writer: global boundary, auth parent row, then the
  -- user-scoped fence. The exclusive helper safely reacquires the shared
  -- global lock before it binds the supported-writer transaction state.
  PERFORM private.lock_timeblock_global_supported_write_v1();

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  SELECT operation.*
  INTO v_operation
  FROM private.account_deletion_operations AS operation
  WHERE operation.user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    deletion_id := v_operation.deletion_id;

    SELECT step.state
    INTO calendar_state
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = p_user_id
      AND step.step = 'calendar';

    SELECT step.state
    INTO storage_state
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = p_user_id
      AND step.step = 'storage';

    SELECT step.state
    INTO billing_state
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = p_user_id
      AND step.step = 'billing';

    IF calendar_state IS NULL
      OR storage_state IS NULL
      OR billing_state IS NULL THEN
      RAISE EXCEPTION 'Account deletion step inventory is incomplete'
        USING ERRCODE = 'AD012';
    END IF;

    RETURN NEXT;
    RETURN;
  END IF;

  v_deletion_id := gen_random_uuid();

  INSERT INTO private.account_deletion_operations (
    user_id,
    deletion_id
  ) VALUES (
    p_user_id,
    v_deletion_id
  );

  INSERT INTO private.account_deletion_steps (
    user_id,
    deletion_id,
    step
  ) VALUES
    (p_user_id, v_deletion_id, 'calendar'),
    (p_user_id, v_deletion_id, 'storage'),
    (p_user_id, v_deletion_id, 'billing');

  deletion_id := v_deletion_id;
  calendar_state := 'pending';
  storage_state := 'pending';
  billing_state := 'pending';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_account_deletion_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_account_deletion_v1(UUID)
  TO service_role;

COMMENT ON FUNCTION public.begin_account_deletion_v1(UUID) IS
  'Begins or resumes one provider-neutral deletion under the global-to-parent-to-user writer lock order; service role only.';

COMMIT;
