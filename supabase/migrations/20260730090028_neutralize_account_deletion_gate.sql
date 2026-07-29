-- Keep the auth-owned account-deletion gate provider neutral. Calendar,
-- Storage, and billing bind and verify their own source state in later
-- additive migrations.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION public.begin_account_deletion_v1(UUID);
DROP FUNCTION public.get_account_deletion_readiness_v1();

ALTER TABLE private.account_deletion_operations
  DROP COLUMN calendar_required,
  DROP COLUMN stripe_customer_id_snapshot;

DROP FUNCTION private.account_deletion_calendar_required_v1(UUID);

CREATE FUNCTION private.account_deletion_gate_is_active_v1()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.account_deletion_control AS control
    WHERE control.singleton
      AND control.activation_version = 1
      AND control.activated_at IS NOT NULL
  );
$$;

CREATE FUNCTION private.account_is_closing_v1(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM private.account_deletion_operations AS operation
      WHERE operation.user_id = p_user_id
    );
$$;

CREATE FUNCTION private.assert_account_not_closing_v1(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.account_is_closing_v1(p_user_id) THEN
    RAISE EXCEPTION 'Account is closing'
      USING ERRCODE = 'AD019';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.account_deletion_gate_is_active_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.account_is_closing_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.assert_account_not_closing_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.assert_account_deletion_gate_active_v1()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.account_deletion_gate_is_active_v1() THEN
    RAISE EXCEPTION 'Account deletion gate is not active'
      USING ERRCODE = 'AD010';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_account_deletion_gate_active_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.begin_account_deletion_v1(p_user_id UUID)
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

  -- Preserve the global order used by all source writers: auth parent row,
  -- then the user-scoped advisory fence.
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

CREATE FUNCTION public.get_account_deletion_readiness_v1()
RETURNS TABLE (
  activated BOOLEAN,
  active_operations BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  RETURN QUERY
  SELECT
    private.account_deletion_gate_is_active_v1(),
    (
      SELECT pg_catalog.count(*)
      FROM private.account_deletion_operations AS operation
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_account_deletion_readiness_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_deletion_readiness_v1()
  TO service_role;

CREATE OR REPLACE FUNCTION public.seal_account_deletion_v1(
  p_deletion_id UUID,
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
  v_operation private.account_deletion_operations%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.assert_account_deletion_gate_active_v1();

  IF p_user_id IS NULL OR p_deletion_id IS NULL THEN
    RAISE EXCEPTION 'Invalid account deletion seal'
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

  SELECT operation.*
  INTO v_operation
  FROM private.account_deletion_operations AS operation
  WHERE operation.user_id = p_user_id
    AND operation.deletion_id = p_deletion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion operation is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = p_user_id
      AND step.deletion_id = p_deletion_id
  ) <> 3
  OR EXISTS (
    SELECT 1
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = p_user_id
      AND step.deletion_id = p_deletion_id
      AND step.state <> 'completed'
  ) THEN
    RAISE EXCEPTION 'Account deletion steps are incomplete'
      USING ERRCODE = 'AD013';
  END IF;

  IF v_operation.state = 'preparing' THEN
    UPDATE private.account_deletion_operations AS operation
    SET state = 'ready',
        ready_at = v_now
    WHERE operation.user_id = p_user_id
      AND operation.deletion_id = p_deletion_id;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.seal_account_deletion_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seal_account_deletion_v1(UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION private.enforce_account_deletion_boundary_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operation private.account_deletion_operations%ROWTYPE;
BEGIN
  IF NOT private.account_deletion_gate_is_active_v1() THEN
    RETURN OLD;
  END IF;

  -- auth.users already owns the parent-row delete lock.
  PERFORM private.lock_timeblock_user_write_exclusive_v1(OLD.id);

  SELECT operation.*
  INTO v_operation
  FROM private.account_deletion_operations AS operation
  WHERE operation.user_id = OLD.id
    AND operation.state = 'ready'
    AND operation.ready_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion operation is not ready'
      USING ERRCODE = 'AD019';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = OLD.id
      AND step.deletion_id = v_operation.deletion_id
  ) <> 3
  OR EXISTS (
    SELECT 1
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = OLD.id
      AND step.deletion_id = v_operation.deletion_id
      AND step.state <> 'completed'
  ) THEN
    RAISE EXCEPTION 'Account deletion work remains incomplete'
      USING ERRCODE = 'AD019';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_account_deletion_boundary_v1()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.account_is_closing_v1(UUID) IS
  'Stable auth-owned predicate for source adapters; true while a generic deletion operation exists.';
COMMENT ON FUNCTION public.begin_account_deletion_v1(UUID) IS
  'Begins or resumes one provider-neutral account deletion and returns its bounded step states; service role only.';
COMMENT ON FUNCTION public.get_account_deletion_readiness_v1() IS
  'Reports generic account-deletion activation and in-flight count without source-specific state; service role only.';
COMMENT ON FUNCTION public.seal_account_deletion_v1(UUID, UUID) IS
  'Seals the generic account deletion only after all three source adapters have recorded completion; service role only.';
COMMENT ON FUNCTION private.enforce_account_deletion_boundary_v1() IS
  'After activation, rejects auth.users deletion without one ready generic operation and exactly three completed source steps.';

COMMIT;
