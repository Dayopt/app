-- Reclaim committed transaction state from pooled or terminated backends
-- without waiting on rows that another transaction is currently replacing.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

CREATE OR REPLACE FUNCTION private.cleanup_stale_timeblock_transaction_state_v1()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM private.timeblock_transaction_states AS state
  USING (
    SELECT candidate.backend_pid, candidate.transaction_id
    FROM private.timeblock_transaction_states AS candidate
    WHERE (candidate.backend_pid, candidate.transaction_id)
      IS DISTINCT FROM (
        pg_catalog.pg_backend_pid(),
        pg_catalog.pg_current_xact_id()
      )
    FOR UPDATE SKIP LOCKED
  ) AS stale
  WHERE state.backend_pid = stale.backend_pid
    AND state.transaction_id = stale.transaction_id;
$$;

REVOKE ALL ON FUNCTION private.cleanup_stale_timeblock_transaction_state_v1()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.cleanup_stale_timeblock_transaction_state_v1() IS
  'Deletes visible committed transaction state while skipping rows another backend still owns.';

COMMIT;
