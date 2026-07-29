-- Do not let account deletion overtake a Stripe request whose response can
-- still arrive. Pre-provider claims remain safe to terminalize immediately.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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
  IF EXISTS (
    SELECT 1
    FROM private.billing_customer_provisioning_attempts AS attempt
    WHERE attempt.user_id = NEW.user_id
      AND attempt.state = 'provider_started'
  ) THEN
    RAISE EXCEPTION 'Billing Customer creation remains unresolved'
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
  private.abort_billing_mutations_for_account_deletion_v1() IS
  'Blocks unresolved Customer creation and retryable Billing provider calls before account deletion; terminalizes only pre-provider or expired claims.';

COMMIT;
