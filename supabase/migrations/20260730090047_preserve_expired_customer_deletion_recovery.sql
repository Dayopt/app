-- Expired Customer attempts are no longer allowed to issue a provider POST.
-- Let account deletion own their read-only provider recovery after the 23-hour
-- retry window while continuing to block live Customer and Billing requests.

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
      AND attempt.provider_retry_deadline_at > v_now
  ) THEN
    RAISE EXCEPTION 'Billing Customer creation remains in flight'
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
  private.abort_billing_mutations_for_account_deletion_v1() IS
  'Blocks live Customer and Billing provider calls before account deletion; terminalizes pre-provider or expired claims for read-only deletion recovery.';

COMMIT;
