-- Preserve a payload-free terminal receipt after auth.users cascades the live
-- account-deletion state. Stripe can deliver subscription.deleted after the
-- account is gone; unknown Customers must still fail closed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.billing_account_deletion_terminal_receipts (
  stripe_customer_id_digest BYTEA PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT billing_account_deletion_terminal_digest_shape CHECK (
    pg_catalog.octet_length(stripe_customer_id_digest) = 32
  ),
  CONSTRAINT billing_account_deletion_terminal_expiry_shape CHECK (
    expires_at > recorded_at
    AND expires_at <= recorded_at + INTERVAL '30 days'
  )
);

CREATE INDEX billing_account_deletion_terminal_receipts_expiry_idx
  ON private.billing_account_deletion_terminal_receipts(expires_at);

REVOKE ALL ON TABLE private.billing_account_deletion_terminal_receipts
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.billing_account_deletion_terminal_receipts IS
  'SHA-256-only, 30-day receipts used to acknowledge Stripe subscription deletion events after an account identity has been removed.';

CREATE FUNCTION private.record_billing_account_deletion_terminal_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_stripe_customer_id TEXT;
BEGIN
  SELECT binding.stripe_customer_id_snapshot
  INTO v_stripe_customer_id
  FROM private.billing_account_deletion_bindings AS binding
  WHERE binding.user_id = OLD.id
    AND binding.state = 'ready'
    AND binding.provider_outcome = 'deleted'
    AND binding.stripe_customer_id_snapshot IS NOT NULL;

  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  INSERT INTO private.billing_account_deletion_terminal_receipts (
    stripe_customer_id_digest,
    recorded_at,
    expires_at
  ) VALUES (
    pg_catalog.sha256(
      pg_catalog.convert_to(v_stripe_customer_id, 'UTF8')
    ),
    v_now,
    v_now + INTERVAL '30 days'
  )
  ON CONFLICT (stripe_customer_id_digest)
  DO UPDATE SET
    recorded_at = EXCLUDED.recorded_at,
    expires_at = EXCLUDED.expires_at;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION
  private.record_billing_account_deletion_terminal_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER zz_record_billing_account_deletion_terminal
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION
    private.record_billing_account_deletion_terminal_v1();

COMMENT ON FUNCTION
  private.record_billing_account_deletion_terminal_v1() IS
  'Records a short-lived Customer digest in the same transaction as a fully sealed account identity deletion.';

CREATE FUNCTION public.sync_billing_subscription_deleted_v1(
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
    profile.subscription_id,
    profile.subscription_status
  INTO
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
      WHERE profile.stripe_customer_id = p_stripe_customer_id;

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
  'Atomically updates the exact live subscription, ignores stale deletions, or acknowledges a 30-day account-deletion receipt; service role only.';

CREATE FUNCTION public.cleanup_billing_account_deletion_terminal_receipts_v1(
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_deleted INTEGER;
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
  )
  DELETE FROM private.billing_account_deletion_terminal_receipts AS receipt
  USING candidates
  WHERE receipt.stripe_customer_id_digest
    = candidates.stripe_customer_id_digest
    AND receipt.expires_at <= v_now;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION
  public.cleanup_billing_account_deletion_terminal_receipts_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.cleanup_billing_account_deletion_terminal_receipts_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION
  public.cleanup_billing_account_deletion_terminal_receipts_v1(INTEGER) IS
  'Deletes expired payload-free billing account-deletion receipts in a bounded batch; service role only.';

COMMIT;
