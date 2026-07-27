-- Add the auth-owned, bounded account-closing state before any application
-- starts using it. Enforcement remains inactive until the mixed-version
-- cutover explicitly advances the private singleton to activation_version 1.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.account_deletion_control (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  activation_version INTEGER NOT NULL DEFAULT 0 CHECK (
    activation_version IN (0, 1)
  ),
  activated_at TIMESTAMPTZ,
  CONSTRAINT account_deletion_control_activation_shape CHECK (
    (
      activation_version = 0
      AND activated_at IS NULL
    )
    OR (
      activation_version = 1
      AND activated_at IS NOT NULL
    )
  )
);

INSERT INTO private.account_deletion_control (singleton)
VALUES (TRUE);

CREATE TABLE private.account_deletion_operations (
  user_id UUID PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  deletion_id UUID NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'preparing' CHECK (
    state IN ('preparing', 'ready')
  ),
  calendar_required BOOLEAN NOT NULL,
  stripe_customer_id_snapshot TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  ready_at TIMESTAMPTZ,
  CONSTRAINT account_deletion_operations_user_deletion_key
    UNIQUE (user_id, deletion_id),
  CONSTRAINT account_deletion_operations_ready_shape CHECK (
    (
      state = 'preparing'
      AND ready_at IS NULL
    )
    OR (
      state = 'ready'
      AND ready_at IS NOT NULL
      AND ready_at >= started_at
    )
  )
);

CREATE TABLE private.account_deletion_steps (
  user_id UUID NOT NULL,
  deletion_id UUID NOT NULL,
  step TEXT NOT NULL CHECK (
    step IN ('calendar', 'storage', 'billing')
  ),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'in_progress', 'completed')
  ),
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, step),
  FOREIGN KEY (user_id, deletion_id)
    REFERENCES private.account_deletion_operations(user_id, deletion_id)
    ON DELETE CASCADE,
  CONSTRAINT account_deletion_steps_state_shape CHECK (
    (
      state = 'pending'
      AND lease_id IS NULL
      AND lease_expires_at IS NULL
      AND completed_at IS NULL
    )
    OR (
      state = 'in_progress'
      AND lease_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND completed_at IS NULL
    )
    OR (
      state = 'completed'
      AND lease_expires_at IS NULL
      AND completed_at IS NOT NULL
    )
  )
);

CREATE TABLE private.billing_mutation_claims (
  operation_id UUID PRIMARY KEY,
  user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  mutation_kind TEXT NOT NULL CHECK (
    mutation_kind IN ('checkout', 'portal')
  ),
  state TEXT NOT NULL DEFAULT 'active' CHECK (
    state IN ('active', 'completed')
  ),
  started_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT billing_mutation_claims_state_shape CHECK (
    (
      state = 'active'
      AND completed_at IS NULL
    )
    OR (
      state = 'completed'
      AND completed_at IS NOT NULL
      AND completed_at >= started_at
    )
  )
);

CREATE UNIQUE INDEX billing_mutation_claims_one_active_user_idx
  ON private.billing_mutation_claims(user_id)
  WHERE state = 'active';

REVOKE ALL ON TABLE private.account_deletion_control
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.account_deletion_operations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.account_deletion_steps
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.billing_mutation_claims
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.account_deletion_operations IS
  'One non-expiring account-closing operation per live identity. The auth.users cascade removes it only after all external cleanup receipts are ready.';
COMMENT ON TABLE private.account_deletion_steps IS
  'Three bounded, replayable cleanup steps for one account deletion: Calendar, Storage, and billing.';
COMMENT ON TABLE private.billing_mutation_claims IS
  'Durable Checkout or Portal claims that serialize provider mutations with account deletion.';

CREATE FUNCTION private.assert_account_deletion_gate_active_v1()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM private.account_deletion_control AS control
    WHERE control.singleton
      AND control.activation_version = 1
      AND control.activated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Account deletion gate is not active'
      USING ERRCODE = 'AD010';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_account_deletion_gate_active_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.account_deletion_calendar_required_v1(
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.calendar_connections AS connection
      WHERE connection.user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM private.calendar_revoke_outbox AS queued
      WHERE queued.user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM private.calendar_revoke_operations AS operation
      WHERE operation.source_user_id = p_user_id
        AND (
          operation.operation_kind = 'account_delete'
          OR operation.state IN ('pending', 'revoke_guarded', 'expiry_guarded')
        )
    )
    OR EXISTS (
      SELECT 1
      FROM private.calendar_oauth_attempts AS attempt
      WHERE attempt.user_id = p_user_id
        AND attempt.completed_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM private.calendar_account_deletion_intents AS intent
      WHERE intent.user_id = p_user_id
    );
$$;

REVOKE ALL ON FUNCTION private.account_deletion_calendar_required_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_account_deletion_readiness_v1()
RETURNS TABLE (
  activated BOOLEAN,
  active_operations BIGINT,
  active_billing_claims BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  RETURN QUERY
  SELECT
    control.activation_version = 1
      AND control.activated_at IS NOT NULL,
    (
      SELECT pg_catalog.count(*)
      FROM private.account_deletion_operations AS operation
    ),
    (
      SELECT pg_catalog.count(*)
      FROM private.billing_mutation_claims AS claim
      WHERE claim.state = 'active'
    )
  FROM private.account_deletion_control AS control
  WHERE control.singleton;
END;
$$;

REVOKE ALL ON FUNCTION public.get_account_deletion_readiness_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_deletion_readiness_v1()
  TO service_role;

COMMENT ON FUNCTION public.get_account_deletion_readiness_v1() IS
  'Reports activation and payload-free in-flight counts for rollout gates; service role only.';

COMMIT;
