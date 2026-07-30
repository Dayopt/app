-- Close the remaining Stripe Customer provisioning replay gaps. Provider
-- start is now mandatory before completion, an exhausted recovery terminalizes
-- its parent mutation, and the service-role entrypoints acquire the global
-- writer lock before touching auth.users.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE private.billing_mutation_claims
  DROP CONSTRAINT billing_mutation_claims_state_shape,
  ADD CONSTRAINT billing_mutation_claims_state_shape CHECK (
    (
      state = 'active'
      AND lease_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND provider_started_at IS NULL
      AND provider_retry_deadline_at IS NULL
      AND provider_customer_id IS NULL
      AND provider_object_id IS NULL
      AND completed_at IS NULL
      AND terminal_reason IS NULL
      AND delete_after IS NULL
    )
    OR (
      state = 'provider_started'
      AND lease_id IS NULL
      AND lease_expires_at IS NULL
      AND provider_started_at IS NOT NULL
      AND provider_retry_deadline_at
        = provider_started_at + INTERVAL '23 hours'
      AND provider_customer_id IS NOT NULL
      AND provider_object_id IS NULL
      AND completed_at IS NULL
      AND terminal_reason IS NULL
      AND delete_after IS NULL
    )
    OR (
      state = 'completed'
      AND lease_id IS NULL
      AND lease_expires_at IS NULL
      AND provider_started_at IS NOT NULL
      AND provider_retry_deadline_at
        = provider_started_at + INTERVAL '23 hours'
      AND provider_customer_id IS NOT NULL
      AND provider_object_id IS NOT NULL
      AND completed_at IS NOT NULL
      AND completed_at >= provider_started_at
      AND terminal_reason IS NULL
      AND delete_after = completed_at + INTERVAL '90 days'
    )
    OR (
      state = 'abandoned'
      AND lease_id IS NULL
      AND lease_expires_at IS NULL
      AND provider_object_id IS NULL
      AND completed_at IS NOT NULL
      AND delete_after = completed_at + INTERVAL '90 days'
      AND (
        (
          provider_started_at IS NULL
          AND provider_retry_deadline_at IS NULL
          AND provider_customer_id IS NULL
          AND terminal_reason IN (
            'account_deletion_before_provider_start',
            'account_deletion_during_customer_recovery',
            'customer_provisioning_not_recovered'
          )
        )
        OR (
          provider_started_at IS NOT NULL
          AND provider_retry_deadline_at
            = provider_started_at + INTERVAL '23 hours'
          AND provider_customer_id IS NOT NULL
          AND completed_at >= provider_started_at
          AND terminal_reason IN (
            'not_created_after_reconcile',
            'provider_retry_expired',
            'account_deletion_after_provider_start'
          )
        )
      )
    )
  );

CREATE FUNCTION public.claim_billing_customer_provisioning_v2(
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
  PERFORM private.lock_timeblock_global_supported_write_v1();

  RETURN QUERY
  SELECT claim.*
  FROM public.claim_billing_customer_provisioning_v1(
    p_email_digest,
    p_operation_id,
    p_user_id
  ) AS claim;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_billing_customer_provisioning_v2(
  TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_customer_provisioning_v2(
  TEXT, UUID, UUID
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_billing_customer_provisioning_v1(
  TEXT, UUID, UUID
) FROM service_role;

CREATE FUNCTION public.start_billing_customer_provisioning_v2(
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

  PERFORM private.lock_timeblock_global_supported_write_v1();

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

REVOKE ALL ON FUNCTION public.start_billing_customer_provisioning_v2(
  UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_billing_customer_provisioning_v2(
  UUID, UUID, UUID
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.start_billing_customer_provisioning_v1(
  UUID, UUID, UUID
) FROM service_role;

CREATE FUNCTION public.complete_billing_customer_provisioning_v2(
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

  PERFORM private.lock_timeblock_global_supported_write_v1();

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

REVOKE ALL ON FUNCTION public.complete_billing_customer_provisioning_v2(
  UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_billing_customer_provisioning_v2(
  UUID, TEXT, UUID
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_billing_customer_provisioning_v1(
  UUID, TEXT, UUID
) FROM service_role;

CREATE FUNCTION public.abandon_billing_customer_provisioning_v2(
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

  PERFORM private.lock_timeblock_global_supported_write_v1();

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

REVOKE ALL ON FUNCTION public.abandon_billing_customer_provisioning_v2(
  UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_billing_customer_provisioning_v2(
  UUID, UUID
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.abandon_billing_customer_provisioning_v1(
  UUID, UUID
) FROM service_role;

CREATE OR REPLACE FUNCTION
  private.abort_billing_mutations_for_account_deletion_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF EXISTS (
    SELECT 1
    FROM private.billing_customer_provisioning_attempts AS attempt
    WHERE attempt.user_id = NEW.user_id
      AND attempt.state = 'provider_started'
      AND attempt.provider_retry_deadline_at > v_now
  ) THEN
    RAISE EXCEPTION 'Billing Customer creation remains in flight'
      USING ERRCODE = 'AD019';
  END IF;

  UPDATE private.billing_mutation_claims AS claim
  SET state = 'abandoned',
      lease_id = NULL,
      lease_expires_at = NULL,
      completed_at = v_now,
      terminal_reason = CASE
        WHEN EXISTS (
          SELECT 1
          FROM private.billing_customer_provisioning_attempts AS attempt
          WHERE attempt.operation_id = claim.operation_id
            AND attempt.state = 'provider_started'
        ) THEN 'account_deletion_during_customer_recovery'
        WHEN claim.state = 'active'
          THEN 'account_deletion_before_provider_start'
        ELSE 'account_deletion_after_provider_start'
      END,
      delete_after = v_now + INTERVAL '90 days'
  WHERE claim.user_id = NEW.user_id
    AND claim.state IN ('active', 'provider_started');

  DELETE FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.user_id = NEW.user_id;

  DELETE FROM private.billing_mutation_responses AS response
  USING private.billing_mutation_claims AS claim
  WHERE claim.operation_id = response.operation_id
    AND claim.user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  private.abort_billing_mutations_for_account_deletion_v1()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.claim_billing_customer_provisioning_v2(
  TEXT, UUID, UUID
) IS
  'Claims or resumes one Customer provisioning attempt after acquiring the global writer lock.';
COMMENT ON FUNCTION public.start_billing_customer_provisioning_v2(
  UUID, UUID, UUID
) IS
  'Starts one exact active Checkout Customer POST before any provider call.';
COMMENT ON FUNCTION public.complete_billing_customer_provisioning_v2(
  UUID, TEXT, UUID
) IS
  'Binds an exact started or previously completed Customer provisioning operation.';
COMMENT ON FUNCTION public.abandon_billing_customer_provisioning_v2(
  UUID, UUID
) IS
  'Terminalizes one exhausted Customer recovery and prevents its operation from reopening a provider window.';
COMMENT ON FUNCTION
  private.abort_billing_mutations_for_account_deletion_v1() IS
  'Blocks live Customer POST recovery and records the exact pre-provider or recovery phase before generic account deletion.';

COMMIT;
