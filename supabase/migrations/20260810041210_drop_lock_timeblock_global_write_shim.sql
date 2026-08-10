-- Resolve the lock_timeblock_global_supported_write_v1 no-op shim left by
-- Candidate 1 (20260730090053). Every remaining caller already relies solely
-- on the user-scoped shared/exclusive lock helpers for same-user exclusion;
-- this migration removes the dead call sites and drops the shim itself.

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

  -- Lock the auth parent row, then the user-scoped fence. The exclusive
  -- helper safely upgrades from the shared lock before it binds the
  -- supported-writer transaction state. Same-user exclusion is enforced
  -- entirely by the user-scoped lock helpers below (no global writer lock).
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

COMMENT ON FUNCTION public.begin_account_deletion_v1(UUID) IS
  'Begins or resumes one provider-neutral deletion under the parent-to-user writer lock order; service role only.';

CREATE OR REPLACE FUNCTION public.claim_billing_customer_provisioning_v2(
  p_email_digest TEXT,
  p_operation_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  result TEXT,
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  provider_retry_deadline_at TIMESTAMPTZ,
  provider_customer_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  RETURN QUERY
  SELECT claim.*
  FROM public.claim_billing_customer_provisioning_v1(
    p_email_digest,
    p_operation_id,
    p_user_id
  ) AS claim;
END;
$$;

COMMENT ON FUNCTION public.claim_billing_customer_provisioning_v2(
  TEXT, UUID, UUID
) IS
  'Claims or resumes one Customer provisioning attempt.';

CREATE OR REPLACE FUNCTION public.start_billing_customer_provisioning_v2(
  p_lease_id UUID,
  p_operation_id UUID,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_attempt private.billing_customer_provisioning_attempts%ROWTYPE;
  v_claim private.billing_mutation_claims%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_lease_id IS NULL
    OR p_operation_id IS NULL
    OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid billing Customer provisioning start'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing Customer provisioning user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_account_not_closing_v1(p_user_id);

  SELECT claim.*
  INTO v_claim
  FROM private.billing_mutation_claims AS claim
  WHERE claim.operation_id = p_operation_id
    AND claim.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_claim.mutation_kind IS DISTINCT FROM 'checkout' THEN
    RAISE EXCEPTION 'Billing mutation cannot provision a Customer'
      USING ERRCODE = 'AD019';
  END IF;

  IF v_claim.state IS DISTINCT FROM 'active' THEN
    RETURN 'superseded';
  END IF;

  SELECT attempt.*
  INTO v_attempt
  FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id
    AND attempt.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing Customer provisioning claim is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  IF v_attempt.state = 'provider_started' THEN
    RETURN CASE
      WHEN v_attempt.provider_retry_deadline_at > v_now
        THEN 'reconcile'
      ELSE 'recover'
    END;
  END IF;

  IF v_attempt.lease_id IS DISTINCT FROM p_lease_id
    OR v_attempt.lease_expires_at <= v_now THEN
    RETURN 'superseded';
  END IF;

  UPDATE private.billing_customer_provisioning_attempts AS attempt
  SET state = 'provider_started',
      lease_id = NULL,
      lease_expires_at = NULL,
      provider_started_at = v_now,
      provider_retry_deadline_at = v_now + INTERVAL '23 hours'
  WHERE attempt.operation_id = p_operation_id;

  RETURN 'started';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_billing_customer_provisioning_v2(
  p_operation_id UUID,
  p_provider_customer_id TEXT,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_attempt private.billing_customer_provisioning_attempts%ROWTYPE;
  v_claim private.billing_mutation_claims%ROWTYPE;
  v_current_customer_id TEXT;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_user_id IS NULL
    OR p_provider_customer_id IS NULL
    OR p_provider_customer_id !~ '^cus_[A-Za-z0-9_]+$'
    OR pg_catalog.char_length(p_provider_customer_id) > 255 THEN
    RAISE EXCEPTION 'Invalid billing Customer provisioning completion'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing Customer provisioning user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_account_not_closing_v1(p_user_id);

  SELECT claim.*
  INTO v_claim
  FROM private.billing_mutation_claims AS claim
  WHERE claim.operation_id = p_operation_id
    AND claim.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_claim.mutation_kind IS DISTINCT FROM 'checkout' THEN
    RAISE EXCEPTION 'Billing Customer provisioning operation is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  SELECT attempt.*
  INTO v_attempt
  FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id
    AND attempt.user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_claim.state IS DISTINCT FROM 'active'
      OR v_attempt.state IS DISTINCT FROM 'provider_started' THEN
      RAISE EXCEPTION 'Billing Customer provider mutation has not started'
        USING ERRCODE = 'AD019';
    END IF;
  END IF;

  SELECT profile.stripe_customer_id
  INTO v_current_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR (
      v_current_customer_id IS NOT NULL
      AND v_current_customer_id
        IS DISTINCT FROM p_provider_customer_id
    ) THEN
    RAISE EXCEPTION 'Billing Customer binding changed'
      USING ERRCODE = 'AD014';
  END IF;

  IF NOT FOUND OR v_attempt.operation_id IS NULL THEN
    IF v_current_customer_id
      IS DISTINCT FROM p_provider_customer_id THEN
      RAISE EXCEPTION 'Billing Customer provisioning receipt is unavailable'
        USING ERRCODE = 'AD012';
    END IF;

    RETURN v_current_customer_id;
  END IF;

  UPDATE public.profiles AS profile
  SET stripe_customer_id = p_provider_customer_id
  WHERE profile.id = p_user_id
    AND profile.stripe_customer_id IS NULL;

  DELETE FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id;

  RETURN p_provider_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.abandon_billing_customer_provisioning_v2(
  p_operation_id UUID,
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
  v_attempt private.billing_customer_provisioning_attempts%ROWTYPE;
  v_claim private.billing_mutation_claims%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid billing Customer provisioning abandon'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing Customer provisioning user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_account_not_closing_v1(p_user_id);

  SELECT claim.*
  INTO v_claim
  FROM private.billing_mutation_claims AS claim
  WHERE claim.operation_id = p_operation_id
    AND claim.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_claim.mutation_kind IS DISTINCT FROM 'checkout' THEN
    RAISE EXCEPTION 'Billing Customer provisioning operation is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  IF v_claim.state = 'abandoned'
    AND v_claim.terminal_reason
      IS NOT DISTINCT FROM 'customer_provisioning_not_recovered' THEN
    RETURN TRUE;
  END IF;

  IF v_claim.state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Billing Customer provisioning cannot be abandoned'
      USING ERRCODE = 'AD019';
  END IF;

  SELECT attempt.*
  INTO v_attempt
  FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id
    AND attempt.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing Customer provisioning claim is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  IF v_attempt.state IS DISTINCT FROM 'provider_started'
    OR v_attempt.provider_retry_deadline_at > v_now THEN
    RAISE EXCEPTION 'Billing Customer provisioning remains recoverable'
      USING ERRCODE = 'AD019';
  END IF;

  UPDATE private.billing_mutation_claims AS claim
  SET state = 'abandoned',
      lease_id = NULL,
      lease_expires_at = NULL,
      completed_at = v_now,
      terminal_reason = 'customer_provisioning_not_recovered',
      delete_after = v_now + INTERVAL '90 days'
  WHERE claim.operation_id = p_operation_id;

  DELETE FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_account_deletion_customer_recovery_v1(
  p_user_id UUID
)
RETURNS TABLE (
  result TEXT,
  operation_id UUID,
  provider_retry_deadline_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_attempt private.billing_customer_provisioning_attempts%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.assert_account_deletion_gate_active_v1();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Account deletion Customer recovery user is required'
      USING ERRCODE = '22004';
  END IF;

  -- Lock the auth parent row, then the user-scoped shared fence. A following
  -- generic begin takes the same prefix before upgrading to the exclusive
  -- user fence. Same-user exclusion is enforced entirely by the user-scoped
  -- lock helpers below (no global writer lock).
  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion Customer recovery user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_account_not_closing_v1(p_user_id);

  SELECT attempt.*
  INTO v_attempt
  FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.state = 'active' THEN
    result := 'none';
    operation_id := NULL;
    provider_retry_deadline_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  operation_id := v_attempt.operation_id;
  provider_retry_deadline_at := v_attempt.provider_retry_deadline_at;
  result := CASE
    WHEN v_attempt.provider_retry_deadline_at > v_now THEN 'wait'
    ELSE 'recover'
  END;
  RETURN NEXT;
END;
$$;

DROP FUNCTION private.lock_timeblock_global_supported_write_v1();

COMMIT;
