-- Record the strongest supported-writer lock acquired by a transaction. A
-- shared -> exclusive advisory-lock upgrade can deadlock with another shared
-- writer that is waiting on the revision row, so reject that composition before
-- either transaction takes another user-specific lock.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE private.timeblock_transaction_states
  ADD COLUMN supported_lock_mode TEXT;

-- Migration-time rows are stale bookkeeping from already completed backends.
-- Treat them conservatively as shared; cleanup removes them on the next writer.
UPDATE private.timeblock_transaction_states
SET supported_lock_mode = 'shared'
WHERE mode = 'supported';

ALTER TABLE private.timeblock_transaction_states
  ADD CONSTRAINT timeblock_transaction_states_supported_lock_mode_check
  CHECK (
    (
      mode = 'supported'
      AND supported_user_id IS NOT NULL
      AND supported_lock_mode IN ('shared', 'exclusive')
    )
    OR (
      mode = 'direct'
      AND supported_user_id IS NULL
      AND supported_lock_mode IS NULL
    )
  );

CREATE FUNCTION private.bind_timeblock_supported_writer_lock_v1(
  p_user_id UUID,
  p_lock_mode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_backend_pid INTEGER := pg_catalog.pg_backend_pid();
  v_transaction_id XID8 := pg_catalog.pg_current_xact_id();
  v_mode TEXT;
  v_supported_user_id UUID;
  v_supported_lock_mode TEXT;
BEGIN
  IF p_user_id IS NULL OR p_lock_mode IS NULL THEN
    RAISE EXCEPTION 'Supported timeblock writer binding is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF p_lock_mode <> ALL (ARRAY['shared', 'exclusive']::TEXT[]) THEN
    RAISE EXCEPTION 'Unsupported timeblock writer lock mode'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.cleanup_stale_timeblock_transaction_state_v1();

  INSERT INTO private.timeblock_transaction_states (
    backend_pid,
    transaction_id,
    mode,
    supported_user_id,
    supported_lock_mode
  )
  VALUES (
    v_backend_pid,
    v_transaction_id,
    'supported',
    p_user_id,
    p_lock_mode
  )
  ON CONFLICT (backend_pid, transaction_id) DO NOTHING;

  SELECT
    state.mode,
    state.supported_user_id,
    state.supported_lock_mode
  INTO
    v_mode,
    v_supported_user_id,
    v_supported_lock_mode
  FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = v_backend_pid
    AND state.transaction_id = v_transaction_id
  FOR UPDATE;

  IF v_mode IS DISTINCT FROM 'supported'
    OR v_supported_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'A timeblock transaction cannot change writer mode or user'
      USING ERRCODE = '22023';
  END IF;

  IF v_supported_lock_mode = 'shared' AND p_lock_mode = 'exclusive' THEN
    RAISE EXCEPTION 'A timeblock transaction cannot upgrade its user lock'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.bind_timeblock_supported_writer_v1(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.bind_timeblock_supported_writer_lock_v1(p_user_id, 'shared');
$$;

CREATE OR REPLACE FUNCTION private.lock_timeblock_user_write_shared_v1(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Timeblock user lock requires a user id'
      USING ERRCODE = '22004';
  END IF;

  PERFORM private.lock_timeblock_global_supported_write_v1();
  PERFORM private.bind_timeblock_supported_writer_lock_v1(p_user_id, 'shared');

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timeblock user not found'
      USING ERRCODE = 'DT001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      'dayopt:timeblock-user-write:' || p_user_id::TEXT,
      6182714039157042
    )
  );

  INSERT INTO private.timeblock_user_revisions (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM revision.user_id
  FROM private.timeblock_user_revisions AS revision
  WHERE revision.user_id = p_user_id
  FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION private.lock_timeblock_user_write_exclusive_v1(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Timeblock user lock requires a user id'
      USING ERRCODE = '22004';
  END IF;

  PERFORM private.lock_timeblock_global_supported_write_v1();
  PERFORM private.bind_timeblock_supported_writer_lock_v1(p_user_id, 'exclusive');

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timeblock user not found'
      USING ERRCODE = 'DT001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dayopt:timeblock-user-write:' || p_user_id::TEXT,
      6182714039157042
    )
  );

  INSERT INTO private.timeblock_user_revisions (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM revision.user_id
  FROM private.timeblock_user_revisions AS revision
  WHERE revision.user_id = p_user_id
  FOR UPDATE;
END;
$$;

REVOKE ALL ON FUNCTION private.bind_timeblock_supported_writer_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.bind_timeblock_supported_writer_lock_v1(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.lock_timeblock_user_write_shared_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.lock_timeblock_user_write_exclusive_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON COLUMN private.timeblock_transaction_states.supported_lock_mode IS
  'Strongest supported-writer advisory lock acquired in this transaction.';
COMMENT ON FUNCTION private.bind_timeblock_supported_writer_lock_v1(UUID, TEXT) IS
  'Binds one supported user and rejects shared-to-exclusive lock upgrades before user-specific locks.';

COMMIT;
