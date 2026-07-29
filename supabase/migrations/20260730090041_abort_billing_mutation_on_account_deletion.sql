-- Account deletion may begin after a billing provider call has left its DB
-- transaction. Terminalize that claim under the same exclusive user fence,
-- discard redirect capabilities, and let Billing delete the bound Customer
-- plus any open Checkout Sessions without issuing another provider POST.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE private.billing_mutation_claims
  DROP CONSTRAINT billing_mutation_claims_state_shape,
  ADD CONSTRAINT billing_mutation_claims_state_shape CHECK (
    (
      state = 'active'
      AND lease_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND provider_started_at IS NULL
      AND provider_retry_deadline_at IS NULL
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
      AND provider_retry_deadline_at
        = provider_started_at + INTERVAL '23 hours'
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
      AND provider_retry_deadline_at
        = provider_started_at + INTERVAL '23 hours'
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
      AND provider_object_id IS NULL
      AND completed_at IS NOT NULL
      AND delete_after = completed_at + INTERVAL '90 days'
      AND (
        (
          provider_started_at IS NULL
          AND provider_retry_deadline_at IS NULL
          AND provider_customer_id IS NULL
          AND terminal_reason = 'account_deletion_before_provider_start'
        )
        OR (
          provider_started_at IS NOT NULL
          AND provider_retry_deadline_at
            = provider_started_at + INTERVAL '23 hours'
          AND provider_customer_id IS NOT NULL
          AND completed_at >= provider_started_at
          AND terminal_reason IN (
            'not_created_after_reconcile',
            'provider_retry_expired',
            'account_deletion_after_provider_start'
          )
        )
      )
    )
  );

CREATE FUNCTION private.abort_billing_mutations_for_account_deletion_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
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

CREATE TRIGGER abort_billing_mutations_for_account_deletion
  AFTER INSERT ON private.account_deletion_operations
  FOR EACH ROW
  EXECUTE FUNCTION
    private.abort_billing_mutations_for_account_deletion_v1();

CREATE FUNCTION public.reconcile_billing_mutation_v4(
  p_operation_id UUID,
  p_outcome TEXT,
  p_provider_customer_id TEXT,
  p_provider_object_id TEXT,
  p_provider_response_url TEXT,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_outcome IS NULL
    OR p_provider_customer_id IS NULL
    OR p_user_id IS NULL THEN
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

  IF EXISTS (
    SELECT 1
    FROM private.account_deletion_operations AS operation
    WHERE operation.user_id = p_user_id
  ) THEN
    RETURN 'account_closing';
  END IF;

  RETURN public.reconcile_billing_mutation_v3(
    p_operation_id,
    p_outcome,
    p_provider_customer_id,
    p_provider_object_id,
    p_provider_response_url,
    p_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_billing_mutation_v4(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_billing_mutation_v4(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID
) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reconcile_billing_mutation_v3(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID
) FROM service_role;

COMMENT ON FUNCTION
  private.abort_billing_mutations_for_account_deletion_v1() IS
  'Terminalizes pre-provider or provider-started Billing claims and redacts redirect capabilities atomically with generic account-deletion begin.';
COMMENT ON FUNCTION public.reconcile_billing_mutation_v4(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID
) IS
  'Reconciles an exact Billing provider response unless account deletion owns the user fence, in which case no redirect capability is retained or returned.';

COMMIT;
