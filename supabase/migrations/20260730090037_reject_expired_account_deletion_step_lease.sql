-- A worker may complete only while it still owns a live cleanup-step lease.
-- Expiry alone invalidates the worker, even before another worker reclaims.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.complete_account_deletion_step_v1(
  p_deletion_id UUID,
  p_lease_id UUID,
  p_step TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_step private.account_deletion_steps%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.assert_account_deletion_gate_active_v1();

  IF p_user_id IS NULL
    OR p_deletion_id IS NULL
    OR p_lease_id IS NULL
    OR p_step NOT IN ('calendar', 'storage', 'billing') THEN
    RAISE EXCEPTION 'Invalid account deletion step completion'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  SELECT step.*
  INTO v_step
  FROM private.account_deletion_steps AS step
  WHERE step.user_id = p_user_id
    AND step.step = p_step
  FOR UPDATE;

  IF NOT FOUND
    OR v_step.deletion_id IS DISTINCT FROM p_deletion_id THEN
    RAISE EXCEPTION 'Account deletion step is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  IF v_step.state = 'completed' THEN
    RETURN TRUE;
  END IF;

  IF v_step.state IS DISTINCT FROM 'in_progress'
    OR v_step.lease_id IS DISTINCT FROM p_lease_id
    OR v_step.lease_expires_at IS NULL
    OR v_step.lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'Account deletion step lease changed'
      USING ERRCODE = 'AD019';
  END IF;

  UPDATE private.account_deletion_steps AS step
  SET state = 'completed',
      lease_expires_at = NULL,
      completed_at = v_now
  WHERE step.user_id = p_user_id
    AND step.step = p_step;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_account_deletion_step_v1(
  UUID, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion_step_v1(
  UUID, UUID, TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.complete_account_deletion_step_v1(
  UUID, UUID, TEXT, UUID
) IS
  'Completes a cleanup step only for its exact unexpired lease; terminal replay remains idempotent.';

COMMIT;
