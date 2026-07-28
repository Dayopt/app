-- Distinguish account-deletion-driven subscription events from ordinary
-- cancellations, and report retention backlog without relying on batch size.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.sync_billing_subscription_deleted_v1(
  p_stripe_customer_id TEXT,
  p_subscription_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_user_id UUID;
  v_current_subscription_id TEXT;
  v_current_status TEXT;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_stripe_customer_id IS NULL
    OR p_stripe_customer_id !~ '^cus_[A-Za-z0-9_]+$'
    OR p_subscription_id IS NULL
    OR p_subscription_id !~ '^sub_[A-Za-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid Stripe subscription deletion identity'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    profile.id,
    profile.subscription_id,
    profile.subscription_status
  INTO
    v_user_id,
    v_current_subscription_id,
    v_current_status
  FROM public.profiles AS profile
  WHERE profile.stripe_customer_id = p_stripe_customer_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_current_subscription_id = p_subscription_id THEN
      UPDATE public.profiles AS profile
      SET subscription_status = 'canceled',
          subscription_id = NULL
      WHERE profile.id = v_user_id;

      IF EXISTS (
        SELECT 1
        FROM private.account_deletion_operations AS operation
        WHERE operation.user_id = v_user_id
      ) THEN
        RETURN 'account_deleting';
      END IF;

      RETURN 'updated';
    END IF;

    IF v_current_subscription_id IS NULL
      AND v_current_status = 'canceled' THEN
      RETURN 'already_terminal';
    END IF;

    RETURN 'stale_subscription';
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

REVOKE ALL ON FUNCTION public.sync_billing_subscription_deleted_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_billing_subscription_deleted_v1(TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.sync_billing_subscription_deleted_v1(TEXT, TEXT) IS
  'Atomically updates the exact live subscription, suppresses account-deletion notifications, ignores stale deletions, or acknowledges a 30-day account-deletion receipt; service role only.';

CREATE FUNCTION public.cleanup_billing_account_deletion_terminal_receipts_v2(
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
  deleted_count INTEGER,
  has_more BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Billing account deletion receipt cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT receipt.stripe_customer_id_digest
    FROM private.billing_account_deletion_terminal_receipts AS receipt
    WHERE receipt.expires_at <= v_now
    ORDER BY receipt.expires_at, receipt.stripe_customer_id_digest
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  deleted AS (
    DELETE FROM private.billing_account_deletion_terminal_receipts AS receipt
    USING candidates
    WHERE receipt.stripe_customer_id_digest
      = candidates.stripe_customer_id_digest
      AND receipt.expires_at <= v_now
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO deleted_count
  FROM deleted;

  SELECT EXISTS (
    SELECT 1
    FROM private.billing_account_deletion_terminal_receipts AS receipt
    WHERE receipt.expires_at <= v_now
  )
  INTO has_more;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION
  public.cleanup_billing_account_deletion_terminal_receipts_v2(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.cleanup_billing_account_deletion_terminal_receipts_v2(INTEGER)
  TO service_role;

COMMENT ON FUNCTION
  public.cleanup_billing_account_deletion_terminal_receipts_v2(INTEGER) IS
  'Deletes one bounded batch of expired billing deletion receipts and reports any remaining or concurrently locked backlog; service role only.';

COMMIT;
