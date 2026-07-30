-- Replace the unbounded v1 billing claim with a request-bound lease and a
-- durable provider-started state. A caller may only execute Stripe with the
-- canonical operation ID as its idempotency key, then reconcile that exact
-- operation to a terminal receipt.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION public.claim_billing_mutation_v1(TEXT, UUID, UUID);
DROP FUNCTION public.complete_billing_mutation_v1(TEXT, UUID, UUID);

DROP INDEX private.billing_mutation_claims_one_active_user_idx;

ALTER TABLE private.billing_mutation_claims
  DROP CONSTRAINT billing_mutation_claims_state_check,
  DROP CONSTRAINT billing_mutation_claims_state_shape,
  ADD COLUMN request_digest BYTEA,
  ADD COLUMN lease_id UUID,
  ADD COLUMN lease_expires_at TIMESTAMPTZ,
  ADD COLUMN provider_started_at TIMESTAMPTZ,
  ADD COLUMN provider_customer_id TEXT,
  ADD COLUMN provider_object_id TEXT,
  ADD COLUMN terminal_reason TEXT,
  ADD COLUMN delete_after TIMESTAMPTZ;

-- The v1 functions were never activated. Deterministic placeholders make a
-- partially exercised local/staging database forward-migratable without
-- pretending that legacy rows contain external provider evidence.
UPDATE private.billing_mutation_claims AS claim
SET request_digest = pg_catalog.sha256(
      pg_catalog.convert_to(claim.operation_id::TEXT, 'UTF8')
    ),
    lease_id = CASE
      WHEN claim.state = 'active' THEN gen_random_uuid()
      ELSE NULL
    END,
    lease_expires_at = CASE
      WHEN claim.state = 'active'
        THEN pg_catalog.clock_timestamp() + INTERVAL '5 minutes'
      ELSE NULL
    END,
    provider_started_at = CASE
      WHEN claim.state = 'completed' THEN claim.started_at
      ELSE NULL
    END,
    provider_object_id = CASE
      WHEN claim.state = 'completed'
        THEN 'legacy_' || claim.operation_id::TEXT
      ELSE NULL
    END,
    delete_after = CASE
      WHEN claim.state = 'completed'
        THEN claim.completed_at + INTERVAL '90 days'
      ELSE NULL
    END;

ALTER TABLE private.billing_mutation_claims
  ALTER COLUMN request_digest SET NOT NULL,
  ADD CONSTRAINT billing_mutation_claims_state_check CHECK (
    state IN ('active', 'provider_started', 'completed', 'abandoned')
  ),
  ADD CONSTRAINT billing_mutation_claims_request_digest_shape CHECK (
    pg_catalog.octet_length(request_digest) = 32
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
    )
  );

CREATE UNIQUE INDEX billing_mutation_claims_one_in_flight_user_idx
  ON private.billing_mutation_claims(user_id)
  WHERE state IN ('active', 'provider_started');

CREATE INDEX billing_mutation_claims_retention_idx
  ON private.billing_mutation_claims(delete_after, operation_id)
  WHERE delete_after IS NOT NULL;

CREATE FUNCTION public.claim_billing_mutation_v2(
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
  provider_object_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_claim private.billing_mutation_claims%ROWTYPE;
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

  -- Serialize same-user billing claims and snapshot changes without taking
  -- ownership of the generic account-deletion protocol.
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

    IF v_claim.state = 'completed' THEN
      result := 'completed';
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
      RETURN NEXT;
      RETURN;
    END IF;

    canonical_operation_id := v_claim.operation_id;
    lease_id := v_claim.lease_id;
    lease_expires_at := v_claim.lease_expires_at;
    provider_object_id := NULL;

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
    gen_random_uuid(),
    v_now + INTERVAL '5 minutes'
  )
  RETURNING
    claim.operation_id,
    claim.lease_id,
    claim.lease_expires_at
  INTO
    canonical_operation_id,
    lease_id,
    lease_expires_at;

  result := 'claimed';
  provider_object_id := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_billing_mutation_v2(
  TEXT, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_mutation_v2(
  TEXT, UUID, TEXT, UUID
) TO service_role;

CREATE FUNCTION public.start_billing_mutation_v2(
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

CREATE FUNCTION public.reconcile_billing_mutation_v2(
  p_operation_id UUID,
  p_outcome TEXT,
  p_provider_customer_id TEXT,
  p_provider_object_id TEXT,
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
      AND p_provider_object_id IS NULL
    )
    OR (
      p_outcome = 'not_created'
      AND p_provider_object_id IS NOT NULL
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

  RETURN CASE
    WHEN p_outcome = 'completed' THEN 'completed'
    ELSE 'abandoned'
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_billing_mutation_v2(
  UUID, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_billing_mutation_v2(
  UUID, TEXT, TEXT, TEXT, UUID
) TO service_role;

CREATE FUNCTION public.cleanup_billing_mutation_claims_v1(
  p_limit INTEGER DEFAULT 250
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'Invalid billing mutation cleanup limit'
      USING ERRCODE = '22023';
  END IF;

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

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_billing_mutation_claims_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_billing_mutation_claims_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.claim_billing_mutation_v2(
  TEXT, UUID, TEXT, UUID
) IS
  'Claims or resumes one request-bound Checkout or Portal operation; terminal replay never authorizes another provider call.';
COMMENT ON FUNCTION public.start_billing_mutation_v2(
  UUID, UUID, TEXT, UUID
) IS
  'Durably marks the exact customer-bound operation before Stripe is called with the canonical operation ID as idempotency key.';
COMMENT ON FUNCTION public.reconcile_billing_mutation_v2(
  UUID, TEXT, TEXT, TEXT, UUID
) IS
  'Records the exact Stripe object or an explicit not-created reconciliation as a terminal retained receipt.';

COMMIT;
