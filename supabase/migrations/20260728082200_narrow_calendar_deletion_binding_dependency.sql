-- Keep Calendar's dependency on the neutral lifecycle contract to the exact
-- generic deletion ID rather than the generic table row type.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION
  private.enforce_calendar_account_deletion_binding_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_generic_deletion_id UUID;
  v_binding private.calendar_account_deletion_bindings%ROWTYPE;
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
  FROM private.calendar_account_deletion_bindings AS binding
  WHERE binding.user_id = OLD.id
    AND binding.generic_deletion_id = v_generic_deletion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar account deletion binding is missing'
      USING ERRCODE = 'CA019';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = OLD.id
      AND step.deletion_id = v_generic_deletion_id
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

COMMENT ON FUNCTION
  private.enforce_calendar_account_deletion_binding_v1() IS
  'Independently verifies the exact Calendar binding and receipt through the neutral generic deletion ID only.';

COMMIT;
