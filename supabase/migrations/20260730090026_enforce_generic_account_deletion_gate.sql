-- Bind Calendar writers and auth.users deletion to the generic auth-owned
-- gate. The trigger is installed now but remains a no-op until the private
-- activation singleton is advanced after old application versions drain.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION private.assert_calendar_account_not_deleting_v1(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM private.account_deletion_operations AS operation
    WHERE operation.user_id = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM private.calendar_account_deletion_intents AS intent
    WHERE intent.user_id = p_user_id
      AND (
        intent.state = 'ready'
        OR intent.expires_at > pg_catalog.clock_timestamp()
      )
  ) THEN
    RAISE EXCEPTION 'Calendar authority is closing for account deletion'
      USING ERRCODE = 'CA019';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
  private.assert_calendar_account_not_deleting_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.enforce_account_deletion_boundary_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operation private.account_deletion_operations%ROWTYPE;
  v_current_customer_id TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM private.account_deletion_control AS control
    WHERE control.singleton
      AND control.activation_version = 1
      AND control.activated_at IS NOT NULL
  ) THEN
    RETURN OLD;
  END IF;

  -- The row being deleted already owns the auth.users parent lock. Take the
  -- exclusive advisory fence next so no shared Storage or billing writer can
  -- commit after these final checks.
  PERFORM private.lock_timeblock_user_write_exclusive_v1(OLD.id);

  SELECT operation.*
  INTO v_operation
  FROM private.account_deletion_operations AS operation
  WHERE operation.user_id = OLD.id
    AND operation.state = 'ready'
    AND operation.ready_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion operation is not ready'
      USING ERRCODE = 'AD019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = OLD.id
      AND step.state <> 'completed'
  )
  OR EXISTS (
    SELECT 1
    FROM private.billing_mutation_claims AS claim
    WHERE claim.user_id = OLD.id
      AND claim.state = 'active'
  ) THEN
    RAISE EXCEPTION 'Account deletion work remains incomplete'
      USING ERRCODE = 'AD019';
  END IF;

  SELECT profile.stripe_customer_id
  INTO v_current_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = OLD.id
  FOR UPDATE;

  IF NOT FOUND
    OR v_current_customer_id
      IS DISTINCT FROM v_operation.stripe_customer_id_snapshot THEN
    RAISE EXCEPTION 'Billing identity changed before account deletion'
      USING ERRCODE = 'AD014';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_account_deletion_boundary_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_account_deletion_boundary
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_account_deletion_boundary_v1();

COMMENT ON FUNCTION private.enforce_account_deletion_boundary_v1() IS
  'After explicit activation, rejects every auth.users deletion without the exact generic cleanup receipts and billing identity snapshot.';

COMMIT;
