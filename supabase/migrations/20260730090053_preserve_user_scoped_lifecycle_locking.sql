-- Candidate 1 intentionally replaced the integration-source global writer lock
-- with a same-user shared/exclusive boundary. Lifecycle commands still call the
-- old helper name to preserve rollout compatibility, but all real exclusion is
-- performed by private.lock_timeblock_user_write_*_v1 for the exact user.

BEGIN;

CREATE FUNCTION private.lock_timeblock_global_supported_write_v1()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Intentionally empty: a database-global lock would serialize unrelated users.
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.lock_timeblock_global_supported_write_v1()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.lock_timeblock_global_supported_write_v1() IS
  'Mixed-version compatibility shim; same-user lifecycle exclusion is enforced by the user-scoped shared/exclusive lock helpers.';

COMMIT;
