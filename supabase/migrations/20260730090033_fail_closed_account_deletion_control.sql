-- A missing activation singleton must never be interpreted as an inactive,
-- permissive gate. Protect the expand-phase control row from deletion now;
-- the later activation migration will make the 0 -> 1 transition monotonic.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION private.account_deletion_gate_is_active_v1()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_activation_version INTEGER;
  v_activated_at TIMESTAMPTZ;
BEGIN
  SELECT control.activation_version, control.activated_at
  INTO v_activation_version, v_activated_at
  FROM private.account_deletion_control AS control
  WHERE control.singleton;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion control is unavailable'
      USING ERRCODE = 'AD018';
  END IF;

  IF (
    v_activation_version = 0
    AND v_activated_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  IF (
    v_activation_version = 1
    AND v_activated_at IS NOT NULL
  ) THEN
    RETURN TRUE;
  END IF;

  RAISE EXCEPTION 'Account deletion control is inconsistent'
    USING ERRCODE = 'AD018';
END;
$$;

REVOKE ALL ON FUNCTION private.account_deletion_gate_is_active_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.protect_account_deletion_control_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Account deletion control cannot be removed'
    USING ERRCODE = 'AD018';
END;
$$;

REVOKE ALL ON FUNCTION private.protect_account_deletion_control_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER protect_account_deletion_control_delete
  BEFORE DELETE ON private.account_deletion_control
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_account_deletion_control_v1();

CREATE TRIGGER protect_account_deletion_control_truncate
  BEFORE TRUNCATE ON private.account_deletion_control
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.protect_account_deletion_control_v1();

COMMENT ON FUNCTION private.account_deletion_gate_is_active_v1() IS
  'Returns the validated expand-phase activation state and fails closed if the singleton is missing or malformed.';
COMMENT ON FUNCTION private.protect_account_deletion_control_v1() IS
  'Preserves the exactly-one activation singleton; monotonic activation is installed only at the explicit cutover.';

COMMIT;
