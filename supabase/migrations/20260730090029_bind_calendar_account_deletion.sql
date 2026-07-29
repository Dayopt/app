-- Calendar owns its source inventory, its deletion identifier, and the exact
-- receipt checked at auth.users deletion. The generic gate only sequences the
-- Calendar step through an explicit binding.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.calendar_account_deletion_bindings (
  user_id UUID PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  generic_deletion_id UUID NOT NULL UNIQUE,
  calendar_deletion_id UUID NOT NULL UNIQUE,
  calendar_required BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  FOREIGN KEY (user_id, generic_deletion_id)
    REFERENCES private.account_deletion_operations(user_id, deletion_id)
    ON DELETE CASCADE,
  CONSTRAINT calendar_account_deletion_binding_distinct_ids CHECK (
    generic_deletion_id <> calendar_deletion_id
  )
);

REVOKE ALL ON TABLE private.calendar_account_deletion_bindings
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.calendar_account_deletion_bindings IS
  'Calendar-owned binding from one generic account deletion to a distinct Calendar deletion receipt.';

CREATE FUNCTION private.calendar_account_deletion_required_v1(
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
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

REVOKE ALL ON FUNCTION private.calendar_account_deletion_required_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.bind_calendar_account_deletion_v1(
  p_generic_deletion_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  calendar_deletion_id UUID,
  calendar_required BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_binding private.calendar_account_deletion_bindings%ROWTYPE;
  v_calendar_deletion_id UUID;
  v_calendar_required BOOLEAN;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.assert_account_deletion_gate_active_v1();

  IF p_generic_deletion_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar account deletion binding'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar account deletion user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  PERFORM 1
  FROM private.account_deletion_operations AS operation
  WHERE operation.user_id = p_user_id
    AND operation.deletion_id = p_generic_deletion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Generic account deletion is unavailable for Calendar'
      USING ERRCODE = 'AD012';
  END IF;

  SELECT binding.*
  INTO v_binding
  FROM private.calendar_account_deletion_bindings AS binding
  WHERE binding.user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_binding.generic_deletion_id
      IS DISTINCT FROM p_generic_deletion_id THEN
      RAISE EXCEPTION 'Calendar deletion binding was reused'
        USING ERRCODE = 'AD004';
    END IF;

    calendar_deletion_id := v_binding.calendar_deletion_id;
    calendar_required := v_binding.calendar_required;
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM 1
  FROM private.account_deletion_steps AS step
  WHERE step.user_id = p_user_id
    AND step.deletion_id = p_generic_deletion_id
    AND step.step = 'calendar'
    AND step.state <> 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar deletion step is already completed without a binding'
      USING ERRCODE = 'AD013';
  END IF;

  SELECT intent.deletion_id
  INTO v_calendar_deletion_id
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = p_user_id
  FOR UPDATE;

  v_calendar_deletion_id :=
    COALESCE(v_calendar_deletion_id, gen_random_uuid());

  IF v_calendar_deletion_id = p_generic_deletion_id THEN
    RAISE EXCEPTION 'Calendar and generic deletion identities collided'
      USING ERRCODE = 'AD004';
  END IF;

  v_calendar_required :=
    private.calendar_account_deletion_required_v1(p_user_id);

  INSERT INTO private.calendar_account_deletion_bindings (
    user_id,
    generic_deletion_id,
    calendar_deletion_id,
    calendar_required
  ) VALUES (
    p_user_id,
    p_generic_deletion_id,
    v_calendar_deletion_id,
    v_calendar_required
  );

  calendar_deletion_id := v_calendar_deletion_id;
  calendar_required := v_calendar_required;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.bind_calendar_account_deletion_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_calendar_account_deletion_v1(UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION private.assert_calendar_account_not_deleting_v1(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.account_is_closing_v1(p_user_id)
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

CREATE FUNCTION private.enforce_calendar_account_deletion_binding_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operation private.account_deletion_operations%ROWTYPE;
  v_binding private.calendar_account_deletion_bindings%ROWTYPE;
BEGIN
  SELECT operation.*
  INTO v_operation
  FROM private.account_deletion_operations AS operation
  WHERE operation.user_id = OLD.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(OLD.id);

  SELECT binding.*
  INTO v_binding
  FROM private.calendar_account_deletion_bindings AS binding
  WHERE binding.user_id = OLD.id
    AND binding.generic_deletion_id = v_operation.deletion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar account deletion binding is missing'
      USING ERRCODE = 'CA019';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = OLD.id
      AND step.deletion_id = v_operation.deletion_id
      AND step.step = 'calendar'
      AND step.state = 'completed'
  ) THEN
    RAISE EXCEPTION 'Calendar account deletion step is incomplete'
      USING ERRCODE = 'CA019';
  END IF;

  IF v_binding.calendar_required THEN
    PERFORM 1
    FROM private.calendar_account_deletion_intents AS intent
    WHERE intent.user_id = OLD.id
      AND intent.deletion_id = v_binding.calendar_deletion_id
      AND intent.state = 'ready'
      AND intent.ready_at IS NOT NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Calendar account deletion receipt is incomplete'
        USING ERRCODE = 'CA019';
    END IF;
  ELSIF private.calendar_account_deletion_required_v1(OLD.id) THEN
    RAISE EXCEPTION 'Calendar authority appeared after binding'
      USING ERRCODE = 'CA019';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION
  private.enforce_calendar_account_deletion_binding_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_calendar_account_deletion_binding
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION
    private.enforce_calendar_account_deletion_binding_v1();

COMMENT ON FUNCTION public.bind_calendar_account_deletion_v1(UUID, UUID) IS
  'Binds one generic deletion to a distinct Calendar-owned deletion identity and immutable source-need decision; service role only.';
COMMENT ON FUNCTION
  private.enforce_calendar_account_deletion_binding_v1() IS
  'Independently verifies the exact Calendar binding, generic step, and Calendar receipt at identity deletion.';

COMMIT;
