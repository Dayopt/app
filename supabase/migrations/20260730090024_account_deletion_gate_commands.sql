-- Issue one canonical account-deletion operation and advance its three
-- external cleanup steps with replayable database leases.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.begin_account_deletion_v1(p_user_id UUID)
RETURNS TABLE (
  deletion_id UUID,
  calendar_required BOOLEAN,
  stripe_customer_id TEXT,
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
  v_calendar_required BOOLEAN;
  v_stripe_customer_id TEXT;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.assert_account_deletion_gate_active_v1();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Account deletion user identity is required'
      USING ERRCODE = '22004';
  END IF;

  -- Match the global lock order used by MCP and Storage writers:
  -- auth.users parent first, then the user-scoped advisory fence.
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
    calendar_required := v_operation.calendar_required;
    stripe_customer_id := v_operation.stripe_customer_id_snapshot;

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

  IF EXISTS (
    SELECT 1
    FROM private.billing_mutation_claims AS claim
    WHERE claim.user_id = p_user_id
      AND claim.state = 'active'
  ) THEN
    RAISE EXCEPTION 'Billing mutation is active for account deletion'
      USING ERRCODE = 'AD019';
  END IF;

  SELECT profile.stripe_customer_id
  INTO v_stripe_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion profile is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  -- Adopt a Calendar deletion ID if an earlier response was lost before the
  -- generic gate existed. Otherwise the generic gate owns the new UUID.
  SELECT intent.deletion_id
  INTO v_deletion_id
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = p_user_id
  FOR UPDATE;

  v_deletion_id := COALESCE(v_deletion_id, gen_random_uuid());
  v_calendar_required :=
    private.account_deletion_calendar_required_v1(p_user_id);

  INSERT INTO private.account_deletion_operations (
    user_id,
    deletion_id,
    calendar_required,
    stripe_customer_id_snapshot,
    started_at
  ) VALUES (
    p_user_id,
    v_deletion_id,
    v_calendar_required,
    v_stripe_customer_id,
    v_now
  );

  INSERT INTO private.account_deletion_steps (
    user_id,
    deletion_id,
    step,
    state,
    completed_at
  ) VALUES
    (
      p_user_id,
      v_deletion_id,
      'calendar',
      CASE WHEN v_calendar_required THEN 'pending' ELSE 'completed' END,
      CASE WHEN v_calendar_required THEN NULL ELSE v_now END
    ),
    (p_user_id, v_deletion_id, 'storage', 'pending', NULL),
    (p_user_id, v_deletion_id, 'billing', 'pending', NULL);

  deletion_id := v_deletion_id;
  calendar_required := v_calendar_required;
  stripe_customer_id := v_stripe_customer_id;
  calendar_state := CASE
    WHEN v_calendar_required THEN 'pending'
    ELSE 'completed'
  END;
  storage_state := 'pending';
  billing_state := 'pending';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_account_deletion_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_account_deletion_v1(UUID)
  TO service_role;

CREATE FUNCTION public.claim_account_deletion_step_v1(
  p_deletion_id UUID,
  p_step TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  result TEXT,
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_operation private.account_deletion_operations%ROWTYPE;
  v_step private.account_deletion_steps%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.assert_account_deletion_gate_active_v1();

  IF p_user_id IS NULL
    OR p_deletion_id IS NULL
    OR p_step NOT IN ('calendar', 'storage', 'billing') THEN
    RAISE EXCEPTION 'Invalid account deletion step claim'
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

  IF v_operation.state = 'ready' THEN
    SELECT step.*
    INTO v_step
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = p_user_id
      AND step.step = p_step;

    IF v_step.state IS DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION 'Ready account deletion has an incomplete step'
        USING ERRCODE = 'AD012';
    END IF;

    result := 'completed';
    lease_id := NULL;
    lease_expires_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_step = 'storage'
    AND NOT EXISTS (
      SELECT 1
      FROM private.account_deletion_steps AS predecessor
      WHERE predecessor.user_id = p_user_id
        AND predecessor.step = 'calendar'
        AND predecessor.state = 'completed'
    ) THEN
    RAISE EXCEPTION 'Calendar deletion step is incomplete'
      USING ERRCODE = 'AD013';
  END IF;

  IF p_step = 'billing'
    AND NOT EXISTS (
      SELECT 1
      FROM private.account_deletion_steps AS predecessor
      WHERE predecessor.user_id = p_user_id
        AND predecessor.step = 'storage'
        AND predecessor.state = 'completed'
    ) THEN
    RAISE EXCEPTION 'Storage deletion step is incomplete'
      USING ERRCODE = 'AD013';
  END IF;

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
    result := 'completed';
    lease_id := NULL;
    lease_expires_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- A response-loss replay receives the same live lease. Multiple app
  -- deliveries may therefore repeat only an idempotent source adapter.
  IF v_step.state = 'in_progress'
    AND v_step.lease_expires_at > v_now THEN
    result := 'claimed';
    lease_id := v_step.lease_id;
    lease_expires_at := v_step.lease_expires_at;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE private.account_deletion_steps AS step
  SET state = 'in_progress',
      lease_id = gen_random_uuid(),
      lease_expires_at = v_now + INTERVAL '5 minutes',
      completed_at = NULL
  WHERE step.user_id = p_user_id
    AND step.step = p_step
  RETURNING
    'claimed',
    step.lease_id,
    step.lease_expires_at
  INTO
    result,
    lease_id,
    lease_expires_at;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_account_deletion_step_v1(
  UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_step_v1(
  UUID, TEXT, UUID
) TO service_role;

CREATE FUNCTION public.complete_account_deletion_step_v1(
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
    OR v_step.lease_id IS DISTINCT FROM p_lease_id THEN
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

CREATE FUNCTION public.seal_account_deletion_v1(
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
  v_current_customer_id TEXT;
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

  IF EXISTS (
    SELECT 1
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = p_user_id
      AND step.state <> 'completed'
  ) THEN
    RAISE EXCEPTION 'Account deletion steps are incomplete'
      USING ERRCODE = 'AD013';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.billing_mutation_claims AS claim
    WHERE claim.user_id = p_user_id
      AND claim.state = 'active'
  ) THEN
    RAISE EXCEPTION 'Billing mutation remains active at account deletion'
      USING ERRCODE = 'AD019';
  END IF;

  SELECT profile.stripe_customer_id
  INTO v_current_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_current_customer_id
      IS DISTINCT FROM v_operation.stripe_customer_id_snapshot THEN
    RAISE EXCEPTION 'Billing identity changed during account deletion'
      USING ERRCODE = 'AD014';
  END IF;

  IF v_operation.calendar_required THEN
    PERFORM 1
    FROM private.calendar_account_deletion_intents AS intent
    WHERE intent.user_id = p_user_id
      AND intent.deletion_id = p_deletion_id
      AND intent.state = 'ready'
      AND intent.ready_at IS NOT NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Calendar account deletion receipt is incomplete'
        USING ERRCODE = 'AD013';
    END IF;
  ELSIF private.account_deletion_calendar_required_v1(p_user_id) THEN
    RAISE EXCEPTION 'Calendar authority appeared after account deletion began'
      USING ERRCODE = 'AD014';
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

COMMENT ON FUNCTION public.begin_account_deletion_v1(UUID) IS
  'Begins or resumes one non-expiring generic account deletion and atomically snapshots Calendar and Stripe targets; service role only.';
COMMENT ON FUNCTION public.claim_account_deletion_step_v1(UUID, TEXT, UUID) IS
  'Claims or replays the canonical lease for one idempotent account-deletion adapter; service role only.';
COMMENT ON FUNCTION public.complete_account_deletion_step_v1(
  UUID, UUID, TEXT, UUID
) IS
  'Records one exact cleanup lease as complete; service role only.';
COMMENT ON FUNCTION public.seal_account_deletion_v1(UUID, UUID) IS
  'Seals the generic account deletion only after all bounded steps and exact external target bindings are complete; service role only.';

COMMIT;
