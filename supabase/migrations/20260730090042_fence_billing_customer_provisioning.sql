-- Fence lazy Stripe Customer provisioning separately from Checkout Session
-- creation. Account deletion waits while a Customer POST has an unknown
-- response, and may abort only work that has not reached Stripe or whose
-- 23-hour recovery window has elapsed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.billing_customer_provisioning_attempts (
  operation_id UUID PRIMARY KEY
    REFERENCES private.billing_mutation_claims(operation_id)
    ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE
    REFERENCES auth.users(id)
    ON DELETE CASCADE,
  email_digest BYTEA NOT NULL CHECK (
    pg_catalog.octet_length(email_digest) = 32
  ),
  state TEXT NOT NULL DEFAULT 'active' CHECK (
    state IN ('active', 'provider_started')
  ),
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  provider_started_at TIMESTAMPTZ,
  provider_retry_deadline_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT billing_customer_provisioning_state_shape CHECK (
    (
      state = 'active'
      AND lease_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND provider_started_at IS NULL
      AND provider_retry_deadline_at IS NULL
    )
    OR (
      state = 'provider_started'
      AND lease_id IS NULL
      AND lease_expires_at IS NULL
      AND provider_started_at IS NOT NULL
      AND provider_retry_deadline_at
        = provider_started_at + INTERVAL '23 hours'
    )
  )
);

REVOKE ALL ON TABLE private.billing_customer_provisioning_attempts
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.billing_customer_provisioning_attempts IS
  'Short-lived recovery fence for one lazy Stripe Customer POST; stores only an email digest and no provider response secret.';

CREATE FUNCTION public.claim_billing_customer_provisioning_v1(
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
DECLARE
  v_attempt private.billing_customer_provisioning_attempts%ROWTYPE;
  v_claim private.billing_mutation_claims%ROWTYPE;
  v_current_customer_id TEXT;
  v_email_digest BYTEA;
  v_new_lease_id UUID;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_user_id IS NULL
    OR p_email_digest IS NULL
    OR p_email_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid billing Customer provisioning claim'
      USING ERRCODE = '22023';
  END IF;

  v_email_digest := pg_catalog.decode(p_email_digest, 'hex');

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
    OR v_claim.mutation_kind IS DISTINCT FROM 'checkout'
    OR v_claim.state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Billing mutation cannot provision a Customer'
      USING ERRCODE = 'AD019';
  END IF;

  SELECT profile.stripe_customer_id
  INTO v_current_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing profile is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  IF v_current_customer_id IS NOT NULL THEN
    result := 'existing';
    lease_id := NULL;
    lease_expires_at := NULL;
    provider_retry_deadline_at := NULL;
    provider_customer_id := v_current_customer_id;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT attempt.*
  INTO v_attempt
  FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_attempt.user_id IS DISTINCT FROM p_user_id
      OR v_attempt.email_digest IS DISTINCT FROM v_email_digest THEN
      RAISE EXCEPTION 'Billing Customer provisioning operation was reused'
        USING ERRCODE = 'AD004';
    END IF;

    provider_customer_id := NULL;

    IF v_attempt.state = 'provider_started' THEN
      lease_id := NULL;
      lease_expires_at := NULL;
      provider_retry_deadline_at :=
        v_attempt.provider_retry_deadline_at;
      result := CASE
        WHEN v_attempt.provider_retry_deadline_at > v_now
          THEN 'reconcile'
        ELSE 'recover'
      END;
    ELSIF v_attempt.lease_expires_at > v_now THEN
      lease_id := v_attempt.lease_id;
      lease_expires_at := v_attempt.lease_expires_at;
      provider_retry_deadline_at := NULL;
      result := 'claimed';
    ELSE
      UPDATE private.billing_customer_provisioning_attempts AS attempt
      SET lease_id = gen_random_uuid(),
          lease_expires_at = v_now + INTERVAL '5 minutes'
      WHERE attempt.operation_id = p_operation_id
      RETURNING attempt.lease_id, attempt.lease_expires_at
      INTO lease_id, lease_expires_at;

      provider_retry_deadline_at := NULL;
      result := 'claimed';
    END IF;

    RETURN NEXT;
    RETURN;
  END IF;

  v_new_lease_id := gen_random_uuid();

  INSERT INTO private.billing_customer_provisioning_attempts (
    operation_id,
    user_id,
    email_digest,
    lease_id,
    lease_expires_at
  ) VALUES (
    p_operation_id,
    p_user_id,
    v_email_digest,
    v_new_lease_id,
    v_now + INTERVAL '5 minutes'
  );

  result := 'claimed';
  lease_id := v_new_lease_id;
  lease_expires_at := v_now + INTERVAL '5 minutes';
  provider_retry_deadline_at := NULL;
  provider_customer_id := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_billing_customer_provisioning_v1(
  TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_customer_provisioning_v1(
  TEXT, UUID, UUID
) TO service_role;

CREATE FUNCTION public.start_billing_customer_provisioning_v1(
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

REVOKE ALL ON FUNCTION public.start_billing_customer_provisioning_v1(
  UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_billing_customer_provisioning_v1(
  UUID, UUID, UUID
) TO service_role;

CREATE FUNCTION public.complete_billing_customer_provisioning_v1(
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

  SELECT attempt.*
  INTO v_attempt
  FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id
    AND attempt.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT profile.stripe_customer_id
    INTO v_current_customer_id
    FROM public.profiles AS profile
    WHERE profile.id = p_user_id
    FOR UPDATE;

    IF v_current_customer_id
      IS DISTINCT FROM p_provider_customer_id THEN
      RAISE EXCEPTION 'Billing Customer provisioning receipt is unavailable'
        USING ERRCODE = 'AD012';
    END IF;

    RETURN v_current_customer_id;
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

  UPDATE public.profiles AS profile
  SET stripe_customer_id = p_provider_customer_id
  WHERE profile.id = p_user_id
    AND profile.stripe_customer_id IS NULL;

  DELETE FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id;

  RETURN p_provider_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_billing_customer_provisioning_v1(
  UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_billing_customer_provisioning_v1(
  UUID, TEXT, UUID
) TO service_role;

CREATE FUNCTION public.abandon_billing_customer_provisioning_v1(
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

  SELECT attempt.*
  INTO v_attempt
  FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id
    AND attempt.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;

  IF v_attempt.state IS DISTINCT FROM 'provider_started'
    OR v_attempt.provider_retry_deadline_at > v_now THEN
    RAISE EXCEPTION 'Billing Customer provisioning remains recoverable'
      USING ERRCODE = 'AD019';
  END IF;

  DELETE FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.abandon_billing_customer_provisioning_v1(
  UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_billing_customer_provisioning_v1(
  UUID, UUID
) TO service_role;

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
            'account_deletion_during_customer_recovery'
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

  DELETE FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.user_id = NEW.user_id;

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
        ) THEN 'account_deletion_during_customer_recovery'
        WHEN claim.state = 'active'
          THEN 'account_deletion_before_provider_start'
        ELSE 'account_deletion_after_provider_start'
      END,
      delete_after = v_now + INTERVAL '90 days'
  WHERE claim.user_id = NEW.user_id
    AND claim.state IN ('active', 'provider_started');

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

COMMENT ON FUNCTION public.claim_billing_customer_provisioning_v1(
  TEXT, UUID, UUID
) IS
  'Claims or resumes one email-digest-bound Stripe Customer provisioning attempt under the shared user fence.';
COMMENT ON FUNCTION public.start_billing_customer_provisioning_v1(
  UUID, UUID, UUID
) IS
  'Durably marks Customer provisioning before the namespaced Stripe idempotency key may be used.';
COMMENT ON FUNCTION public.complete_billing_customer_provisioning_v1(
  UUID, TEXT, UUID
) IS
  'Binds one recovered or created Stripe Customer to the profile and removes the temporary provisioning fence.';
COMMENT ON FUNCTION public.abandon_billing_customer_provisioning_v1(
  UUID, UUID
) IS
  'Removes an unrecovered Customer provisioning attempt only after its 23-hour provider retry window.';

COMMIT;
