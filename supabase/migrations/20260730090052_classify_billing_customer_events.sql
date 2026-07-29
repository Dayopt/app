-- Classify customer-bearing Stripe events without exposing live or deleted identities.
-- This lets webhook handlers acknowledge terminal account-deletion events while
-- failing closed for an unknown Customer.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.classify_billing_customer_event_v1(
  p_stripe_customer_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_stripe_customer_id IS NULL
    OR p_stripe_customer_id !~ '^cus_[A-Za-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid Stripe Customer identity'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.stripe_customer_id = p_stripe_customer_id
  ) THEN
    RETURN 'live';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.billing_account_deletion_terminal_receipts AS receipt
    WHERE receipt.stripe_customer_id_digest = pg_catalog.sha256(
      pg_catalog.convert_to(p_stripe_customer_id, 'UTF8')
    )
      AND receipt.expires_at > pg_catalog.clock_timestamp()
  ) THEN
    RETURN 'account_deleted';
  END IF;

  RETURN 'unknown_customer';
END;
$$;

REVOKE ALL ON FUNCTION public.classify_billing_customer_event_v1(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classify_billing_customer_event_v1(TEXT)
  TO service_role;

COMMENT ON FUNCTION public.classify_billing_customer_event_v1(TEXT) IS
  'Classifies a Stripe Customer as live, covered by a short-lived deletion receipt, or unknown; service role only.';

COMMIT;
