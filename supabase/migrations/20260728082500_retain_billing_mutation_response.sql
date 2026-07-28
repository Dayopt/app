-- Keep a short-lived provider response for exact HTTP response-loss replay.
-- The 90-day mutation receipt retains only non-secret provider identifiers.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE private.billing_mutation_claims
  DROP CONSTRAINT billing_mutation_claims_state_shape,
  ADD COLUMN provider_response_url TEXT,
  ADD COLUMN provider_response_expires_at TIMESTAMPTZ,
  ADD CONSTRAINT billing_mutation_claims_provider_response_shape CHECK (
    (
      provider_response_url IS NULL
      AND provider_response_expires_at IS NULL
    )
    OR (
      state = 'completed'
      AND provider_response_url ~ '^https://[^[:space:]]+$'
      AND provider_response_url !~ '[[:cntrl:]]'
      AND pg_catalog.char_length(provider_response_url) <= 4096
      AND provider_response_expires_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND provider_response_expires_at > completed_at
      AND provider_response_expires_at
        <= completed_at + INTERVAL '15 minutes'
    )
  ),
  ADD CONSTRAINT billing_mutation_claims_state_shape CHECK (
    (
      state = 'active'
      AND lease_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND provider_started_at IS NULL
      AND provider_customer_id IS NULL
      AND provider_object_id IS NULL
      AND completed_at IS NULL
      AND terminal_reason IS NULL
      AND delete_after IS NULL
      AND provider_response_url IS NULL
      AND provider_response_expires_at IS NULL
    )
    OR (
      state = 'provider_started'
      AND lease_id IS NULL
      AND lease_expires_at IS NULL
      AND provider_started_at IS NOT NULL
      AND provider_customer_id IS NOT NULL
      AND provider_object_id IS NULL
      AND completed_at IS NULL
      AND terminal_reason IS NULL
      AND delete_after IS NULL
      AND provider_response_url IS NULL
      AND provider_response_expires_at IS NULL
    )
    OR (
      state = 'completed'
      AND lease_id IS NULL
      AND lease_expires_at IS NULL
      AND provider_started_at IS NOT NULL
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
      AND provider_customer_id IS NOT NULL
      AND provider_object_id IS NULL
      AND completed_at IS NOT NULL
      AND completed_at >= provider_started_at
      AND terminal_reason = 'not_created_after_reconcile'
      AND delete_after = completed_at + INTERVAL '90 days'
      AND provider_response_url IS NULL
      AND provider_response_expires_at IS NULL
    )
  );

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
  v_claim private.billing_mutation_claims%ROWTYPE;
  v_new_lease_id UUID;
  v_request_digest BYTEA;
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
    provider_object_id := v_claim.provider_object_id;
    provider_response_url := v_claim.provider_response_url;
    provider_response_expires_at := v_claim.provider_response_expires_at;

    IF v_claim.state = 'completed' THEN
      IF v_claim.provider_response_url IS NOT NULL
        AND v_claim.provider_response_expires_at > v_now THEN
        result := 'completed';
      ELSE
        UPDATE private.billing_mutation_claims AS claim
        SET provider_response_url = NULL,
            provider_response_expires_at = NULL
        WHERE claim.operation_id = p_operation_id;

        result := 'response_expired';
        provider_response_url := NULL;
        provider_response_expires_at := NULL;
      END IF;
    ELSIF v_claim.state = 'abandoned' THEN
      result := 'abandoned';
    ELSIF v_claim.state = 'provider_started' THEN
      result := 'reconcile';
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
      provider_object_id := NULL;
      provider_response_url := NULL;
      provider_response_expires_at := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    canonical_operation_id := v_claim.operation_id;
    lease_id := v_claim.lease_id;
    lease_expires_at := v_claim.lease_expires_at;
    provider_object_id := NULL;
    provider_response_url := NULL;
    provider_response_expires_at := NULL;

    IF v_claim.state = 'provider_started' THEN
      result := 'reconcile';
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

  IF v_claim.state = 'completed' THEN
    IF p_outcome IS DISTINCT FROM 'completed'
      OR v_claim.provider_object_id
        IS DISTINCT FROM p_provider_object_id THEN
      RAISE EXCEPTION 'Billing terminal outcome changed on replay'
        USING ERRCODE = 'AD004';
    END IF;

    IF v_claim.provider_response_url IS NULL
      OR v_claim.provider_response_expires_at <= v_now THEN
      UPDATE private.billing_mutation_claims AS claim
      SET provider_response_url = NULL,
          provider_response_expires_at = NULL
      WHERE claim.operation_id = p_operation_id;

      RETURN 'response_expired';
    END IF;

    IF v_claim.provider_response_url
      IS DISTINCT FROM p_provider_response_url THEN
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
      provider_response_url = p_provider_response_url,
      provider_response_expires_at = CASE
        WHEN p_outcome = 'completed'
          THEN v_now + INTERVAL '15 minutes'
        ELSE NULL
      END,
      completed_at = v_now,
      terminal_reason = CASE
        WHEN p_outcome = 'not_created'
          THEN 'not_created_after_reconcile'
        ELSE NULL
      END,
      delete_after = v_now + INTERVAL '90 days'
  WHERE claim.operation_id = p_operation_id;

  RETURN CASE
    WHEN p_outcome = 'completed' THEN 'completed'
    ELSE 'abandoned'
  END;
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
    SELECT claim.operation_id
    FROM private.billing_mutation_claims AS claim
    WHERE claim.provider_response_expires_at
      <= pg_catalog.clock_timestamp()
    ORDER BY claim.provider_response_expires_at, claim.operation_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE private.billing_mutation_claims AS claim
  SET provider_response_url = NULL,
      provider_response_expires_at = NULL
  FROM candidates
  WHERE claim.operation_id = candidates.operation_id;

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

COMMENT ON COLUMN
  private.billing_mutation_claims.provider_response_url IS
  'Short-lived Stripe redirect URL for exact response-loss replay; redacted after at most 15 minutes.';
COMMENT ON FUNCTION public.claim_billing_mutation_v3(
  TEXT, UUID, TEXT, UUID
) IS
  'Claims or resumes one billing operation and returns a short-lived terminal response without authorizing another provider call.';
COMMENT ON FUNCTION public.reconcile_billing_mutation_v3(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID
) IS
  'Stores the exact provider object and a short-lived redirect response before returning a terminal billing result.';
COMMENT ON FUNCTION public.cleanup_billing_mutation_claims_v2(INTEGER) IS
  'Redacts expired provider redirect responses and deletes due 90-day billing receipts in bounded service-role batches.';

COMMIT;
