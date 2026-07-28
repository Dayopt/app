-- A Stripe Customer POST may have succeeded even when its response never
-- reached Dayopt. Preserve every provider-started provisioning attempt until
-- account deletion has reconciled the exact user metadata at Stripe.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.get_account_deletion_customer_recovery_v1(
  p_user_id UUID
)
RETURNS TABLE (
  result TEXT,
  operation_id UUID,
  provider_retry_deadline_at TIMESTAMPTZ
)
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
  PERFORM private.assert_account_deletion_gate_active_v1();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Account deletion Customer recovery user is required'
      USING ERRCODE = '22004';
  END IF;

  -- Match billing writers: global boundary, auth parent row, then the
  -- user-scoped shared fence. A following generic begin takes the same prefix
  -- before upgrading to the exclusive user fence.
  PERFORM private.lock_timeblock_global_supported_write_v1();

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion Customer recovery user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_account_not_closing_v1(p_user_id);

  SELECT attempt.*
  INTO v_attempt
  FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.state = 'active' THEN
    result := 'none';
    operation_id := NULL;
    provider_retry_deadline_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  operation_id := v_attempt.operation_id;
  provider_retry_deadline_at := v_attempt.provider_retry_deadline_at;
  result := CASE
    WHEN v_attempt.provider_retry_deadline_at > v_now THEN 'wait'
    ELSE 'recover'
  END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_account_deletion_customer_recovery_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_account_deletion_customer_recovery_v1(UUID)
  TO service_role;

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
  -- A provider-started Customer attempt is never safe to discard here. Live
  -- attempts must wait; expired attempts must first be reconciled by the
  -- service-role recovery command above and completed or abandoned explicitly.
  IF EXISTS (
    SELECT 1
    FROM private.billing_customer_provisioning_attempts AS attempt
    WHERE attempt.user_id = NEW.user_id
      AND attempt.state = 'provider_started'
  ) THEN
    RAISE EXCEPTION 'Billing Customer creation requires reconciliation'
      USING ERRCODE = 'AD019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.billing_mutation_claims AS claim
    WHERE claim.user_id = NEW.user_id
      AND claim.state = 'provider_started'
      AND claim.provider_retry_deadline_at > v_now
  ) THEN
    RAISE EXCEPTION 'Billing provider request remains in flight'
      USING ERRCODE = 'AD019';
  END IF;

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
            AND attempt.state = 'provider_started'
        ) THEN 'account_deletion_during_customer_recovery'
        WHEN claim.state = 'active'
          THEN 'account_deletion_before_provider_start'
        ELSE 'account_deletion_after_provider_start'
      END,
      delete_after = v_now + INTERVAL '90 days'
  WHERE claim.user_id = NEW.user_id
    AND claim.state IN ('active', 'provider_started');

  DELETE FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.user_id = NEW.user_id;

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

COMMENT ON FUNCTION
  public.get_account_deletion_customer_recovery_v1(UUID) IS
  'Reports whether generic account deletion must wait for or recover one exact provider-started Stripe Customer provisioning attempt; service role only.';
COMMENT ON FUNCTION
  private.abort_billing_mutations_for_account_deletion_v1() IS
  'Blocks every unresolved provider-started Customer creation and live Billing provider call before generic account deletion.';

COMMIT;
