-- Repair the v2 claim insert path without changing its public contract.
-- The original INSERT RETURNING referenced an undeclared table alias.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.claim_billing_mutation_v2(
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
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_billing_mutation_v2(
  TEXT, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_mutation_v2(
  TEXT, UUID, TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.claim_billing_mutation_v2(
  TEXT, UUID, TEXT, UUID
) IS
  'Claims or resumes one request-bound Checkout or Portal operation; terminal replay never authorizes another provider call.';

COMMIT;
