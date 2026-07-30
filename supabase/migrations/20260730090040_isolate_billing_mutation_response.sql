-- Separate short-lived Stripe redirect capabilities from the 90-day audit
-- receipt, bound provider retries to Stripe's idempotency window, and stop
-- returning redirect capabilities once account deletion begins.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE private.billing_mutation_claims
  ADD COLUMN provider_retry_deadline_at TIMESTAMPTZ;

UPDATE private.billing_mutation_claims AS claim
SET provider_retry_deadline_at =
  claim.provider_started_at + INTERVAL '23 hours'
WHERE claim.state IN ('provider_started', 'completed', 'abandoned');

CREATE TABLE private.billing_mutation_responses (
  operation_id UUID PRIMARY KEY
    REFERENCES private.billing_mutation_claims(operation_id)
    ON DELETE CASCADE,
  response_url TEXT NOT NULL CHECK (
    response_url ~ '^https://[^[:space:]]+$'
    AND response_url !~ '[[:cntrl:]]'
    AND pg_catalog.char_length(response_url) <= 4096
  ),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX billing_mutation_responses_expiry_idx
  ON private.billing_mutation_responses(expires_at, operation_id);

REVOKE ALL ON TABLE private.billing_mutation_responses
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.billing_mutation_responses (
  operation_id,
  response_url,
  created_at,
  expires_at
)
SELECT
  claim.operation_id,
  claim.provider_response_url,
  claim.completed_at,
  LEAST(
    claim.provider_response_expires_at,
    claim.provider_started_at + CASE claim.mutation_kind
      WHEN 'portal' THEN INTERVAL '5 minutes'
      ELSE INTERVAL '10 minutes'
    END
  )
FROM private.billing_mutation_claims AS claim
WHERE claim.provider_response_url IS NOT NULL
  AND claim.provider_response_expires_at IS NOT NULL;

DROP FUNCTION public.claim_billing_mutation_v3(TEXT, UUID, TEXT, UUID);
DROP FUNCTION public.reconcile_billing_mutation_v3(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID
);
DROP FUNCTION public.cleanup_billing_mutation_claims_v2(INTEGER);

ALTER TABLE private.billing_mutation_claims
  DROP CONSTRAINT billing_mutation_claims_provider_response_shape,
  DROP CONSTRAINT billing_mutation_claims_state_shape,
  DROP COLUMN provider_response_url,
  DROP COLUMN provider_response_expires_at,
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
      AND provider_started_at IS NOT NULL
      AND provider_retry_deadline_at
        = provider_started_at + INTERVAL '23 hours'
      AND provider_customer_id IS NOT NULL
      AND provider_object_id IS NULL
      AND completed_at IS NOT NULL
      AND completed_at >= provider_started_at
      AND terminal_reason IN (
        'not_created_after_reconcile',
        'provider_retry_expired'
      )
      AND delete_after = completed_at + INTERVAL '90 days'
    )
  );

CREATE OR REPLACE FUNCTION public.start_billing_mutation_v2(
  p_operation_id UUID,
  p_lease_id UUID,
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
  v_claim private.billing_mutation_claims%ROWTYPE;
  v_current_customer_id TEXT;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_lease_id IS NULL
    OR p_provider_customer_id IS NULL
    OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid billing provider start'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing mutation user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  SELECT profile.stripe_customer_id
  INTO v_current_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_current_customer_id IS DISTINCT FROM p_provider_customer_id THEN
    RAISE EXCEPTION 'Billing customer binding changed before provider start'
      USING ERRCODE = 'AD014';
  END IF;

  SELECT claim.*
  INTO v_claim
  FROM private.billing_mutation_claims AS claim
  WHERE claim.operation_id = p_operation_id
    AND claim.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing mutation claim is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  IF v_claim.state IN ('completed', 'abandoned') THEN
    RETURN v_claim.state;
  END IF;

  IF v_claim.state = 'provider_started' THEN
    IF v_claim.provider_customer_id
      IS DISTINCT FROM p_provider_customer_id THEN
      RAISE EXCEPTION 'Billing customer binding changed on replay'
        USING ERRCODE = 'AD004';
    END IF;

    IF v_claim.provider_retry_deadline_at <= v_now THEN
      UPDATE private.billing_mutation_claims AS claim
      SET state = 'abandoned',
          completed_at = v_now,
          terminal_reason = 'provider_retry_expired',
          delete_after = v_now + INTERVAL '90 days'
      WHERE claim.operation_id = p_operation_id;

      RETURN 'retry_expired';
    END IF;

    RETURN 'reconcile';
  END IF;

  IF v_claim.lease_id IS DISTINCT FROM p_lease_id
    OR v_claim.lease_expires_at IS NULL
    OR v_claim.lease_expires_at <= v_now THEN
    RETURN 'superseded';
  END IF;

  UPDATE private.billing_mutation_claims AS claim
  SET state = 'provider_started',
      lease_id = NULL,
      lease_expires_at = NULL,
      provider_started_at = v_now,
      provider_retry_deadline_at = v_now + INTERVAL '23 hours',
      provider_customer_id = p_provider_customer_id
  WHERE claim.operation_id = p_operation_id;

  RETURN 'started';
END;
$$;

REVOKE ALL ON FUNCTION public.start_billing_mutation_v2(
  UUID, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_billing_mutation_v2(
  UUID, UUID, TEXT, UUID
) TO service_role;

CREATE FUNCTION public.claim_billing_mutation_v3(
  p_mutation_kind TEXT,
  p_operation_id UUID,
  p_request_digest TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  result TEXT,
  canonical_operation_id UUID,
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  provider_retry_deadline_at TIMESTAMPTZ,
  provider_object_id TEXT,
  provider_response_url TEXT,
  provider_response_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_account_closing BOOLEAN;
  v_claim private.billing_mutation_claims%ROWTYPE;
  v_new_lease_id UUID;
  v_request_digest BYTEA;
  v_response private.billing_mutation_responses%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL
    OR p_operation_id IS NULL
    OR p_mutation_kind NOT IN ('checkout', 'portal')
    OR p_request_digest IS NULL
    OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid billing mutation claim'
      USING ERRCODE = '22023';
  END IF;

  v_request_digest := pg_catalog.decode(p_request_digest, 'hex');

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing mutation user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  PERFORM 1
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing profile is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  SELECT claim.*
  INTO v_claim
  FROM private.billing_mutation_claims AS claim
  WHERE claim.operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_claim.user_id IS DISTINCT FROM p_user_id
      OR v_claim.mutation_kind IS DISTINCT FROM p_mutation_kind
      OR v_claim.request_digest IS DISTINCT FROM v_request_digest THEN
      RAISE EXCEPTION 'Billing mutation operation was reused'
        USING ERRCODE = 'AD004';
    END IF;

    canonical_operation_id := v_claim.operation_id;
    lease_id := v_claim.lease_id;
    lease_expires_at := v_claim.lease_expires_at;
    provider_retry_deadline_at := v_claim.provider_retry_deadline_at;
    provider_object_id := v_claim.provider_object_id;
    provider_response_url := NULL;
    provider_response_expires_at := NULL;

    SELECT EXISTS (
      SELECT 1
      FROM private.account_deletion_operations AS operation
      WHERE operation.user_id = p_user_id
    )
    INTO v_account_closing;

    IF v_account_closing THEN
      DELETE FROM private.billing_mutation_responses AS response
      WHERE response.operation_id = p_operation_id;

      result := 'account_closing';
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_claim.state = 'completed' THEN
      SELECT response.*
      INTO v_response
      FROM private.billing_mutation_responses AS response
      WHERE response.operation_id = p_operation_id
      FOR UPDATE;

      IF FOUND
        AND v_response.expires_at > v_now + INTERVAL '30 seconds' THEN
        result := 'completed';
        provider_response_url := v_response.response_url;
        provider_response_expires_at := v_response.expires_at;
      ELSE
        DELETE FROM private.billing_mutation_responses AS response
        WHERE response.operation_id = p_operation_id;

        result := 'response_expired';
      END IF;
    ELSIF v_claim.state = 'abandoned' THEN
      result := 'abandoned';
    ELSIF v_claim.state = 'provider_started' THEN
      IF v_claim.provider_retry_deadline_at > v_now THEN
        result := 'reconcile';
      ELSE
        UPDATE private.billing_mutation_claims AS claim
        SET state = 'abandoned',
            completed_at = v_now,
            terminal_reason = 'provider_retry_expired',
            delete_after = v_now + INTERVAL '90 days'
        WHERE claim.operation_id = p_operation_id;

        result := 'abandoned';
      END IF;
    ELSIF v_claim.lease_expires_at > v_now THEN
      result := 'claimed';
    ELSE
      UPDATE private.billing_mutation_claims AS claim
      SET lease_id = gen_random_uuid(),
          lease_expires_at = v_now + INTERVAL '5 minutes'
      WHERE claim.operation_id = p_operation_id
      RETURNING claim.lease_id, claim.lease_expires_at
      INTO lease_id, lease_expires_at;

      result := 'claimed';
    END IF;

    RETURN NEXT;
    RETURN;
  END IF;

  SELECT claim.*
  INTO v_claim
  FROM private.billing_mutation_claims AS claim
  WHERE claim.user_id = p_user_id
    AND claim.state IN ('active', 'provider_started')
  FOR UPDATE;

  IF FOUND THEN
    IF v_claim.mutation_kind IS DISTINCT FROM p_mutation_kind
      OR v_claim.request_digest IS DISTINCT FROM v_request_digest THEN
      result := 'contention';
      canonical_operation_id := NULL;
      lease_id := NULL;
      lease_expires_at := NULL;
      provider_retry_deadline_at := NULL;
      provider_object_id := NULL;
      provider_response_url := NULL;
      provider_response_expires_at := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    canonical_operation_id := v_claim.operation_id;
    lease_id := v_claim.lease_id;
    lease_expires_at := v_claim.lease_expires_at;
    provider_retry_deadline_at := v_claim.provider_retry_deadline_at;
    provider_object_id := NULL;
    provider_response_url := NULL;
    provider_response_expires_at := NULL;

    IF v_claim.state = 'provider_started' THEN
      IF v_claim.provider_retry_deadline_at > v_now THEN
        result := 'reconcile';
      ELSE
        UPDATE private.billing_mutation_claims AS claim
        SET state = 'abandoned',
            completed_at = v_now,
            terminal_reason = 'provider_retry_expired',
            delete_after = v_now + INTERVAL '90 days'
        WHERE claim.operation_id = v_claim.operation_id;

        result := 'abandoned';
      END IF;
    ELSIF v_claim.lease_expires_at > v_now THEN
      result := 'claimed';
    ELSE
      UPDATE private.billing_mutation_claims AS claim
      SET lease_id = gen_random_uuid(),
          lease_expires_at = v_now + INTERVAL '5 minutes'
      WHERE claim.operation_id = v_claim.operation_id
      RETURNING claim.lease_id, claim.lease_expires_at
      INTO lease_id, lease_expires_at;

      result := 'claimed';
    END IF;

    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM private.assert_account_not_closing_v1(p_user_id);

  v_new_lease_id := gen_random_uuid();

  INSERT INTO private.billing_mutation_claims (
    operation_id,
    user_id,
    mutation_kind,
    request_digest,
    lease_id,
    lease_expires_at
  ) VALUES (
    p_operation_id,
    p_user_id,
    p_mutation_kind,
    v_request_digest,
    v_new_lease_id,
    v_now + INTERVAL '5 minutes'
  );

  result := 'claimed';
  canonical_operation_id := p_operation_id;
  lease_id := v_new_lease_id;
  lease_expires_at := v_now + INTERVAL '5 minutes';
  provider_retry_deadline_at := NULL;
  provider_object_id := NULL;
  provider_response_url := NULL;
  provider_response_expires_at := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_billing_mutation_v3(
  TEXT, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_mutation_v3(
  TEXT, UUID, TEXT, UUID
) TO service_role;

CREATE FUNCTION public.reconcile_billing_mutation_v3(
  p_operation_id UUID,
  p_outcome TEXT,
  p_provider_customer_id TEXT,
  p_provider_object_id TEXT,
  p_provider_response_url TEXT,
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
  v_claim private.billing_mutation_claims%ROWTYPE;
  v_response private.billing_mutation_responses%ROWTYPE;
  v_response_expires_at TIMESTAMPTZ;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_outcome NOT IN ('completed', 'not_created')
    OR p_provider_customer_id IS NULL
    OR p_user_id IS NULL
    OR (
      p_outcome = 'completed'
      AND (
        p_provider_object_id IS NULL
        OR p_provider_response_url IS NULL
        OR p_provider_response_url !~ '^https://[^[:space:]]+$'
        OR p_provider_response_url ~ '[[:cntrl:]]'
        OR pg_catalog.char_length(p_provider_response_url) > 4096
      )
    )
    OR (
      p_outcome = 'not_created'
      AND (
        p_provider_object_id IS NOT NULL
        OR p_provider_response_url IS NOT NULL
      )
    ) THEN
    RAISE EXCEPTION 'Invalid billing reconciliation'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing mutation user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  PERFORM 1
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
    AND profile.stripe_customer_id = p_provider_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing customer binding changed before reconciliation'
      USING ERRCODE = 'AD014';
  END IF;

  SELECT claim.*
  INTO v_claim
  FROM private.billing_mutation_claims AS claim
  WHERE claim.operation_id = p_operation_id
    AND claim.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing mutation claim is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  IF v_claim.provider_customer_id
    IS DISTINCT FROM p_provider_customer_id THEN
    RAISE EXCEPTION 'Billing customer binding changed on reconciliation'
      USING ERRCODE = 'AD004';
  END IF;

  IF p_outcome = 'completed'
    AND (
      (
        v_claim.mutation_kind = 'checkout'
        AND p_provider_response_url
          !~ '^https://checkout[.]stripe[.]com/'
      )
      OR (
        v_claim.mutation_kind = 'portal'
        AND p_provider_response_url
          !~ '^https://billing[.]stripe[.]com/'
      )
    ) THEN
    RAISE EXCEPTION 'Unexpected billing provider response origin'
      USING ERRCODE = '22023';
  END IF;

  IF v_claim.state = 'completed' THEN
    IF p_outcome IS DISTINCT FROM 'completed'
      OR v_claim.provider_object_id
        IS DISTINCT FROM p_provider_object_id THEN
      RAISE EXCEPTION 'Billing terminal outcome changed on replay'
        USING ERRCODE = 'AD004';
    END IF;

    SELECT response.*
    INTO v_response
    FROM private.billing_mutation_responses AS response
    WHERE response.operation_id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_response.expires_at <= v_now + INTERVAL '30 seconds' THEN
      DELETE FROM private.billing_mutation_responses AS response
      WHERE response.operation_id = p_operation_id;

      RETURN 'response_expired';
    END IF;

    IF v_response.response_url IS DISTINCT FROM p_provider_response_url THEN
      RAISE EXCEPTION 'Billing provider response changed on replay'
        USING ERRCODE = 'AD004';
    END IF;

    RETURN 'completed';
  END IF;

  IF v_claim.state = 'abandoned' THEN
    IF p_outcome IS DISTINCT FROM 'not_created' THEN
      RAISE EXCEPTION 'Billing terminal outcome changed on replay'
        USING ERRCODE = 'AD004';
    END IF;

    RETURN 'abandoned';
  END IF;

  IF v_claim.state IS DISTINCT FROM 'provider_started' THEN
    RAISE EXCEPTION 'Billing provider mutation has not started'
      USING ERRCODE = 'AD019';
  END IF;

  UPDATE private.billing_mutation_claims AS claim
  SET state = CASE
        WHEN p_outcome = 'completed' THEN 'completed'
        ELSE 'abandoned'
      END,
      provider_object_id = p_provider_object_id,
      completed_at = v_now,
      terminal_reason = CASE
        WHEN p_outcome = 'not_created'
          THEN 'not_created_after_reconcile'
        ELSE NULL
      END,
      delete_after = v_now + INTERVAL '90 days'
  WHERE claim.operation_id = p_operation_id;

  IF p_outcome = 'not_created' THEN
    RETURN 'abandoned';
  END IF;

  v_response_expires_at :=
    v_claim.provider_started_at + CASE v_claim.mutation_kind
      WHEN 'portal' THEN INTERVAL '5 minutes'
      ELSE INTERVAL '10 minutes'
    END;

  IF v_response_expires_at <= v_now + INTERVAL '30 seconds' THEN
    RETURN 'response_expired';
  END IF;

  INSERT INTO private.billing_mutation_responses (
    operation_id,
    response_url,
    created_at,
    expires_at
  ) VALUES (
    p_operation_id,
    p_provider_response_url,
    v_now,
    v_response_expires_at
  );

  RETURN 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_billing_mutation_v3(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_billing_mutation_v3(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID
) TO service_role;

CREATE FUNCTION public.cleanup_billing_mutation_claims_v2(
  p_limit INTEGER DEFAULT 250
)
RETURNS TABLE (
  provider_responses_redacted INTEGER,
  claims_deleted INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'Invalid billing mutation cleanup limit'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT response.operation_id
    FROM private.billing_mutation_responses AS response
    WHERE response.expires_at <= pg_catalog.clock_timestamp()
    ORDER BY response.expires_at, response.operation_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.billing_mutation_responses AS response
  USING candidates
  WHERE response.operation_id = candidates.operation_id;

  GET DIAGNOSTICS provider_responses_redacted = ROW_COUNT;

  WITH candidates AS (
    SELECT claim.operation_id
    FROM private.billing_mutation_claims AS claim
    WHERE claim.state IN ('completed', 'abandoned')
      AND claim.delete_after <= pg_catalog.clock_timestamp()
    ORDER BY claim.delete_after, claim.operation_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.billing_mutation_claims AS claim
  USING candidates
  WHERE claim.operation_id = candidates.operation_id;

  GET DIAGNOSTICS claims_deleted = ROW_COUNT;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_billing_mutation_claims_v2(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_billing_mutation_claims_v2(INTEGER)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_billing_mutation_v2(
  TEXT, UUID, TEXT, UUID
) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.reconcile_billing_mutation_v2(
  UUID, TEXT, TEXT, TEXT, UUID
) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_billing_mutation_claims_v1(INTEGER)
  FROM service_role;

COMMENT ON TABLE private.billing_mutation_responses IS
  'Short-lived Stripe redirect capabilities, physically separated from retained billing mutation receipts.';
COMMENT ON COLUMN
  private.billing_mutation_claims.provider_retry_deadline_at IS
  'Last DB time at which the canonical Stripe idempotency key may authorize a provider POST retry.';
COMMENT ON FUNCTION public.claim_billing_mutation_v3(
  TEXT, UUID, TEXT, UUID
) IS
  'Claims or resumes one billing operation, bounds provider retry to 23 hours, and never returns redirect capabilities while an account is closing.';
COMMENT ON FUNCTION public.reconcile_billing_mutation_v3(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID
) IS
  'Atomically retains the provider receipt and a non-extendable five-minute Portal or ten-minute Checkout redirect response.';
COMMENT ON FUNCTION public.cleanup_billing_mutation_claims_v2(INTEGER) IS
  'Deletes expired redirect capability rows and due 90-day billing receipts in bounded service-role batches.';

COMMIT;
