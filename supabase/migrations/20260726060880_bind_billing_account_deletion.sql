-- Billing owns the Stripe customer snapshot and external deletion receipt.
-- The generic lifecycle only observes completion of the billing step.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.billing_account_deletion_bindings (
  user_id UUID PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  generic_deletion_id UUID NOT NULL UNIQUE,
  stripe_customer_id_snapshot TEXT,
  state TEXT NOT NULL DEFAULT 'preparing' CHECK (
    state IN ('preparing', 'ready')
  ),
  provider_outcome TEXT CHECK (
    provider_outcome IN ('deleted', 'not_present')
  ),
  bound_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  ready_at TIMESTAMPTZ,
  FOREIGN KEY (user_id, generic_deletion_id)
    REFERENCES private.account_deletion_operations(user_id, deletion_id)
    ON DELETE CASCADE,
  CONSTRAINT billing_account_deletion_binding_state_shape CHECK (
    (
      state = 'preparing'
      AND provider_outcome IS NULL
      AND ready_at IS NULL
    )
    OR (
      state = 'ready'
      AND ready_at IS NOT NULL
      AND (
        (
          stripe_customer_id_snapshot IS NULL
          AND provider_outcome = 'not_present'
        )
        OR (
          stripe_customer_id_snapshot IS NOT NULL
          AND provider_outcome = 'deleted'
        )
      )
    )
  )
);

REVOKE ALL ON TABLE private.billing_account_deletion_bindings
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.billing_account_deletion_bindings IS
  'Billing-owned exact Stripe target and terminal provider receipt for one generic account deletion.';

CREATE FUNCTION public.bind_billing_account_deletion_v1(
  p_generic_deletion_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  stripe_customer_id TEXT,
  binding_state TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_binding private.billing_account_deletion_bindings%ROWTYPE;
  v_stripe_customer_id TEXT;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.assert_account_deletion_gate_active_v1();

  IF p_generic_deletion_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid billing account deletion binding'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing account deletion user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  PERFORM 1
  FROM private.account_deletion_operations AS operation
  WHERE operation.user_id = p_user_id
    AND operation.deletion_id = p_generic_deletion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Generic account deletion is unavailable for billing'
      USING ERRCODE = 'AD012';
  END IF;

  SELECT binding.*
  INTO v_binding
  FROM private.billing_account_deletion_bindings AS binding
  WHERE binding.user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_binding.generic_deletion_id
      IS DISTINCT FROM p_generic_deletion_id THEN
      RAISE EXCEPTION 'Billing deletion binding was reused'
        USING ERRCODE = 'AD004';
    END IF;

    stripe_customer_id := v_binding.stripe_customer_id_snapshot;
    binding_state := v_binding.state;
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM 1
  FROM private.account_deletion_steps AS step
  WHERE step.user_id = p_user_id
    AND step.deletion_id = p_generic_deletion_id
    AND step.step = 'billing'
    AND step.state <> 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing deletion step is already completed without a binding'
      USING ERRCODE = 'AD013';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.billing_mutation_claims AS claim
    WHERE claim.user_id = p_user_id
      AND claim.state IN ('active', 'provider_started')
  ) THEN
    RAISE EXCEPTION 'Billing mutation remains in flight'
      USING ERRCODE = 'AD019';
  END IF;

  SELECT profile.stripe_customer_id
  INTO v_stripe_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing profile is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  INSERT INTO private.billing_account_deletion_bindings (
    user_id,
    generic_deletion_id,
    stripe_customer_id_snapshot
  ) VALUES (
    p_user_id,
    p_generic_deletion_id,
    v_stripe_customer_id
  );

  stripe_customer_id := v_stripe_customer_id;
  binding_state := 'preparing';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.bind_billing_account_deletion_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_billing_account_deletion_v1(UUID, UUID)
  TO service_role;

CREATE FUNCTION public.seal_billing_account_deletion_v1(
  p_generic_deletion_id UUID,
  p_provider_outcome TEXT,
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
  v_binding private.billing_account_deletion_bindings%ROWTYPE;
  v_current_customer_id TEXT;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.assert_account_deletion_gate_active_v1();

  IF p_generic_deletion_id IS NULL
    OR p_user_id IS NULL
    OR p_provider_outcome NOT IN ('deleted', 'not_present') THEN
    RAISE EXCEPTION 'Invalid billing account deletion seal'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing account deletion user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  SELECT binding.*
  INTO v_binding
  FROM private.billing_account_deletion_bindings AS binding
  WHERE binding.user_id = p_user_id
    AND binding.generic_deletion_id = p_generic_deletion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing account deletion binding is unavailable'
      USING ERRCODE = 'AD012';
  END IF;

  IF (
    v_binding.stripe_customer_id_snapshot IS NULL
    AND p_provider_outcome IS DISTINCT FROM 'not_present'
  )
  OR (
    v_binding.stripe_customer_id_snapshot IS NOT NULL
    AND p_provider_outcome IS DISTINCT FROM 'deleted'
  ) THEN
    RAISE EXCEPTION 'Billing provider outcome does not match the bound target'
      USING ERRCODE = 'AD004';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.billing_mutation_claims AS claim
    WHERE claim.user_id = p_user_id
      AND claim.state IN ('active', 'provider_started')
  ) THEN
    RAISE EXCEPTION 'Billing mutation remains in flight'
      USING ERRCODE = 'AD019';
  END IF;

  SELECT profile.stripe_customer_id
  INTO v_current_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_current_customer_id
      IS DISTINCT FROM v_binding.stripe_customer_id_snapshot THEN
    RAISE EXCEPTION 'Billing identity changed during account deletion'
      USING ERRCODE = 'AD014';
  END IF;

  IF v_binding.state = 'ready' THEN
    IF v_binding.provider_outcome
      IS DISTINCT FROM p_provider_outcome THEN
      RAISE EXCEPTION 'Billing deletion outcome changed on replay'
        USING ERRCODE = 'AD004';
    END IF;

    RETURN TRUE;
  END IF;

  UPDATE private.billing_account_deletion_bindings AS binding
  SET state = 'ready',
      provider_outcome = p_provider_outcome,
      ready_at = pg_catalog.clock_timestamp()
  WHERE binding.user_id = p_user_id
    AND binding.generic_deletion_id = p_generic_deletion_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.seal_billing_account_deletion_v1(
  UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seal_billing_account_deletion_v1(
  UUID, TEXT, UUID
) TO service_role;

CREATE FUNCTION private.enforce_billing_account_deletion_boundary_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_generic_deletion_id UUID;
  v_binding private.billing_account_deletion_bindings%ROWTYPE;
  v_current_customer_id TEXT;
BEGIN
  SELECT operation.deletion_id
  INTO v_generic_deletion_id
  FROM private.account_deletion_operations AS operation
  WHERE operation.user_id = OLD.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(OLD.id);

  SELECT binding.*
  INTO v_binding
  FROM private.billing_account_deletion_bindings AS binding
  WHERE binding.user_id = OLD.id
    AND binding.generic_deletion_id = v_generic_deletion_id
    AND binding.state = 'ready'
    AND binding.ready_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing account deletion receipt is incomplete'
      USING ERRCODE = 'AD019';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = OLD.id
      AND step.deletion_id = v_generic_deletion_id
      AND step.step = 'billing'
      AND step.state = 'completed'
  )
  OR EXISTS (
    SELECT 1
    FROM private.billing_mutation_claims AS claim
    WHERE claim.user_id = OLD.id
      AND claim.state IN ('active', 'provider_started')
  ) THEN
    RAISE EXCEPTION 'Billing account deletion work remains incomplete'
      USING ERRCODE = 'AD019';
  END IF;

  SELECT profile.stripe_customer_id
  INTO v_current_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = OLD.id
  FOR UPDATE;

  IF NOT FOUND
    OR v_current_customer_id
      IS DISTINCT FROM v_binding.stripe_customer_id_snapshot THEN
    RAISE EXCEPTION 'Billing identity changed before account deletion'
      USING ERRCODE = 'AD014';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION
  private.enforce_billing_account_deletion_boundary_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_billing_account_deletion_boundary
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION
    private.enforce_billing_account_deletion_boundary_v1();

COMMENT ON FUNCTION public.bind_billing_account_deletion_v1(UUID, UUID) IS
  'Binds the exact current Stripe Customer to one generic account deletion after all in-flight billing mutations settle.';
COMMENT ON FUNCTION public.seal_billing_account_deletion_v1(
  UUID, TEXT, UUID
) IS
  'Records the exact deleted or absent Stripe Customer outcome before the generic billing step may complete.';
COMMENT ON FUNCTION
  private.enforce_billing_account_deletion_boundary_v1() IS
  'Independently verifies the billing binding, provider receipt, generic step, and absence of in-flight mutations at identity deletion.';

COMMIT;
