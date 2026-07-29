-- Report backlog after each bounded Billing cleanup batch so the maintenance
-- caller does not mistake concurrently locked or over-limit rows for success.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION public.cleanup_billing_mutation_claims_v2(INTEGER);

CREATE FUNCTION public.cleanup_billing_mutation_claims_v2(
  p_limit INTEGER DEFAULT 250
)
RETURNS TABLE (
  provider_responses_redacted INTEGER,
  claims_deleted INTEGER,
  has_more BOOLEAN
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

  SELECT
    EXISTS (
      SELECT 1
      FROM private.billing_mutation_responses AS response
      WHERE response.expires_at <= pg_catalog.clock_timestamp()
    )
    OR EXISTS (
      SELECT 1
      FROM private.billing_mutation_claims AS claim
      WHERE claim.state IN ('completed', 'abandoned')
        AND claim.delete_after <= pg_catalog.clock_timestamp()
    )
  INTO has_more;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_billing_mutation_claims_v2(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_billing_mutation_claims_v2(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.cleanup_billing_mutation_claims_v2(INTEGER) IS
  'Redacts expired Stripe redirect capabilities, deletes retained terminal claims, and reports remaining due work; service role only.';

COMMIT;
