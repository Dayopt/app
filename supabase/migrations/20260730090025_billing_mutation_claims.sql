-- Serialize Checkout and Portal provider mutations with the generic
-- account-closing gate. A same-kind retry adopts the canonical active
-- operation so a browser reload can reconcile an unknown provider response.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.claim_billing_mutation_v1(
  p_mutation_kind TEXT,
  p_operation_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  result TEXT,
  canonical_operation_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_claim private.billing_mutation_claims%ROWTYPE;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL
    OR p_operation_id IS NULL
    OR p_mutation_kind NOT IN ('checkout', 'portal') THEN
    RAISE EXCEPTION 'Invalid billing mutation claim'
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

  IF EXISTS (
    SELECT 1
    FROM private.account_deletion_operations AS operation
    WHERE operation.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Account is closing'
      USING ERRCODE = 'AD019';
  END IF;

  SELECT claim.*
  INTO v_claim
  FROM private.billing_mutation_claims AS claim
  WHERE claim.operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_claim.user_id IS DISTINCT FROM p_user_id
      OR v_claim.mutation_kind IS DISTINCT FROM p_mutation_kind THEN
      RAISE EXCEPTION 'Billing mutation operation was reused'
        USING ERRCODE = 'AD004';
    END IF;

    result := 'claimed';
    canonical_operation_id := v_claim.operation_id;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT claim.*
  INTO v_claim
  FROM private.billing_mutation_claims AS claim
  WHERE claim.user_id = p_user_id
    AND claim.state = 'active'
  FOR UPDATE;

  IF FOUND THEN
    IF v_claim.mutation_kind IS DISTINCT FROM p_mutation_kind THEN
      result := 'contention';
      canonical_operation_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    result := 'claimed';
    canonical_operation_id := v_claim.operation_id;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO private.billing_mutation_claims (
    operation_id,
    user_id,
    mutation_kind
  ) VALUES (
    p_operation_id,
    p_user_id,
    p_mutation_kind
  );

  result := 'claimed';
  canonical_operation_id := p_operation_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_billing_mutation_v1(
  TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_mutation_v1(
  TEXT, UUID, UUID
) TO service_role;

CREATE FUNCTION public.complete_billing_mutation_v1(
  p_mutation_kind TEXT,
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
  v_claim private.billing_mutation_claims%ROWTYPE;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL
    OR p_operation_id IS NULL
    OR p_mutation_kind NOT IN ('checkout', 'portal') THEN
    RAISE EXCEPTION 'Invalid billing mutation completion'
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

  SELECT claim.*
  INTO v_claim
  FROM private.billing_mutation_claims AS claim
  WHERE claim.operation_id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_claim.user_id IS DISTINCT FROM p_user_id
    OR v_claim.mutation_kind IS DISTINCT FROM p_mutation_kind THEN
    RAISE EXCEPTION 'Billing mutation claim is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  IF v_claim.state = 'completed' THEN
    RETURN TRUE;
  END IF;

  UPDATE private.billing_mutation_claims AS claim
  SET state = 'completed',
      completed_at = pg_catalog.clock_timestamp()
  WHERE claim.operation_id = p_operation_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_billing_mutation_v1(
  TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_billing_mutation_v1(
  TEXT, UUID, UUID
) TO service_role;

COMMENT ON FUNCTION public.claim_billing_mutation_v1(TEXT, UUID, UUID) IS
  'Claims or resumes one canonical Checkout or Portal mutation under the shared user fence; service role only.';
COMMENT ON FUNCTION public.complete_billing_mutation_v1(TEXT, UUID, UUID) IS
  'Marks one exact billing provider mutation as durably complete before account deletion may bind its targets; service role only.';

COMMIT;
