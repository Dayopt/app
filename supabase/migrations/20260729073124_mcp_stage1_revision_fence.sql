-- Candidate 1 terminal writer fence: supported commands bind one user and use
-- user-scoped locks. Current direct Product DML keeps its existing concurrency.
-- Revision changes are transactional and coalesced once.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. Private marker and transaction state
-- =============================================================================

CREATE TABLE private.timeblock_user_revisions (
  user_id UUID PRIMARY KEY,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE UNLOGGED TABLE private.timeblock_transaction_states (
  backend_pid INTEGER NOT NULL,
  transaction_id XID8 NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('supported', 'direct')),
  supported_user_id UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (backend_pid, transaction_id),
  CHECK (
    (mode = 'supported' AND supported_user_id IS NOT NULL)
    OR (mode = 'direct' AND supported_user_id IS NULL)
  )
);

CREATE UNLOGGED TABLE private.timeblock_transaction_revision_bumps (
  backend_pid INTEGER NOT NULL,
  transaction_id XID8 NOT NULL,
  user_id UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (backend_pid, transaction_id, user_id),
  FOREIGN KEY (backend_pid, transaction_id)
    REFERENCES private.timeblock_transaction_states (backend_pid, transaction_id)
    ON DELETE CASCADE
);

REVOKE ALL ON TABLE
  private.timeblock_user_revisions,
  private.timeblock_transaction_states,
  private.timeblock_transaction_revision_bumps
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.timeblock_user_revisions IS
  'Opaque per-user Plan / Record invalidation marker initialized for every auth user and removed after account deletion.';
COMMENT ON COLUMN private.timeblock_user_revisions.revision IS
  'Opaque decimal invalidation token; it is not a count of user-visible changes.';
COMMENT ON TABLE private.timeblock_transaction_states IS
  'Caller-inaccessible writer mode and user binding keyed by backend PID and xid8.';
COMMENT ON TABLE private.timeblock_transaction_revision_bumps IS
  'Caller-inaccessible per-user revision coalescing state for one transaction.';

-- =============================================================================
-- 2. Private transaction state
-- =============================================================================

CREATE FUNCTION private.cleanup_stale_timeblock_transaction_state_v1()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id IS DISTINCT FROM pg_catalog.pg_current_xact_id();
$$;

CREATE FUNCTION private.bind_timeblock_supported_writer_v1(p_user_id UUID)
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
BEGIN
  PERFORM private.cleanup_stale_timeblock_transaction_state_v1();

  INSERT INTO private.timeblock_transaction_states (
    backend_pid,
    transaction_id,
    mode,
    supported_user_id
  )
  VALUES (
    v_backend_pid,
    v_transaction_id,
    'supported',
    p_user_id
  )
  ON CONFLICT (backend_pid, transaction_id) DO NOTHING;

  SELECT state.mode, state.supported_user_id
  INTO v_mode, v_supported_user_id
  FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = v_backend_pid
    AND state.transaction_id = v_transaction_id
  FOR UPDATE;

  IF v_mode IS DISTINCT FROM 'supported'
    OR v_supported_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'A timeblock transaction cannot change writer mode or user'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE FUNCTION private.bind_timeblock_direct_writer_v1()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_backend_pid INTEGER := pg_catalog.pg_backend_pid();
  v_transaction_id XID8 := pg_catalog.pg_current_xact_id();
  v_mode TEXT;
BEGIN
  PERFORM private.cleanup_stale_timeblock_transaction_state_v1();

  INSERT INTO private.timeblock_transaction_states (
    backend_pid,
    transaction_id,
    mode,
    supported_user_id
  )
  VALUES (
    v_backend_pid,
    v_transaction_id,
    'direct',
    NULL
  )
  ON CONFLICT (backend_pid, transaction_id) DO NOTHING;

  SELECT state.mode
  INTO v_mode
  FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = v_backend_pid
    AND state.transaction_id = v_transaction_id
  FOR UPDATE;

  IF v_mode IS DISTINCT FROM 'direct' THEN
    RAISE EXCEPTION 'A timeblock transaction cannot change writer mode'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE FUNCTION private.current_timeblock_transaction_state_v1()
RETURNS TABLE(mode TEXT, supported_user_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT state.mode, state.supported_user_id
  FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();
$$;

CREATE FUNCTION private.claim_timeblock_revision_bump_v1(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_backend_pid INTEGER := pg_catalog.pg_backend_pid();
  v_transaction_id XID8 := pg_catalog.pg_current_xact_id();
  v_claimed BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM private.timeblock_transaction_states AS state
    WHERE state.backend_pid = v_backend_pid
      AND state.transaction_id = v_transaction_id
  ) THEN
    RAISE EXCEPTION 'Timeblock revision bump requires transaction state'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO private.timeblock_transaction_revision_bumps (
    backend_pid,
    transaction_id,
    user_id
  )
  VALUES (
    v_backend_pid,
    v_transaction_id,
    p_user_id
  )
  ON CONFLICT (backend_pid, transaction_id, user_id) DO NOTHING
  RETURNING true
  INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION private.cleanup_stale_timeblock_transaction_state_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.bind_timeblock_supported_writer_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.bind_timeblock_direct_writer_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.current_timeblock_transaction_state_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.claim_timeblock_revision_bump_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

-- =============================================================================
-- 3. Supported-writer lock order
-- =============================================================================

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

  PERFORM private.bind_timeblock_supported_writer_v1(p_user_id);

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

  PERFORM private.bind_timeblock_supported_writer_v1(p_user_id);

END;
$$;

REVOKE ALL ON FUNCTION private.lock_timeblock_user_write_shared_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.lock_timeblock_user_write_exclusive_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;


-- 4. Statement and row boundaries
-- =============================================================================

CREATE FUNCTION private.guard_direct_timeblock_statement_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_mode TEXT;
BEGIN
  SELECT state.mode
  INTO v_mode
  FROM private.current_timeblock_transaction_state_v1() AS state;

  IF v_mode IS NULL THEN
    PERFORM private.bind_timeblock_direct_writer_v1();
  ELSIF v_mode <> ALL (ARRAY['supported', 'direct']::TEXT[]) THEN
    RAISE EXCEPTION 'Invalid timeblock transaction state'
      USING ERRCODE = '55000';
  END IF;

  RETURN NULL;
END;
$$;

CREATE FUNCTION private.assert_timeblock_writer_row_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode TEXT;
  v_supported_user_id UUID;
BEGIN
  SELECT state.mode, state.supported_user_id
  INTO v_mode, v_supported_user_id
  FROM private.current_timeblock_transaction_state_v1() AS state;

  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'Timeblock row write requires transaction state'
      USING ERRCODE = '55000';
  END IF;

  IF v_mode = 'supported' THEN
    IF (TG_OP <> 'INSERT' AND OLD.user_id IS DISTINCT FROM v_supported_user_id)
      OR (TG_OP <> 'DELETE' AND NEW.user_id IS DISTINCT FROM v_supported_user_id) THEN
      RAISE EXCEPTION 'A supported timeblock transaction cannot write another user'
        USING ERRCODE = '22023';
    END IF;
  ELSIF v_mode IS DISTINCT FROM 'direct' THEN
    RAISE EXCEPTION 'Invalid timeblock transaction state'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_direct_timeblock_statement_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.assert_timeblock_writer_row_v1()
  FROM PUBLIC, anon, authenticated, service_role;

-- =============================================================================
-- 5. Deferred revision changes at the table boundary
-- =============================================================================

CREATE FUNCTION private.bump_timeblock_user_revision_v1(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.claim_timeblock_revision_bump_v1(p_user_id) THEN
    RETURN;
  END IF;

  UPDATE private.timeblock_user_revisions AS marker
  SET
    revision = marker.revision + 1,
    changed_at = pg_catalog.clock_timestamp()
  WHERE marker.user_id = p_user_id;
END;
$$;

CREATE FUNCTION private.bump_timeblock_revision_from_row_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM private.bump_timeblock_user_revision_v1(OLD.user_id);
    PERFORM private.bump_timeblock_user_revision_v1(NEW.user_id);
  ELSE
    PERFORM private.bump_timeblock_user_revision_v1(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.bump_timeblock_user_revision_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.bump_timeblock_revision_from_row_v1()
  FROM PUBLIC, anon, authenticated, service_role;

-- =============================================================================
-- 6. Narrow service-role marker and effective ACL checks
-- =============================================================================

CREATE FUNCTION public.get_timeblock_context_marker_v1(p_user_id UUID)
RETURNS TABLE(
  revision TEXT,
  database_now TIMESTAMPTZ,
  timezone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '15s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  RETURN QUERY
  SELECT
    COALESCE(marker.revision, 0)::TEXT,
    pg_catalog.clock_timestamp(),
    COALESCE(settings.timezone, 'UTC')
  FROM (VALUES (p_user_id)) AS requested(user_id)
  LEFT JOIN private.timeblock_user_revisions AS marker
    ON marker.user_id = requested.user_id
  LEFT JOIN public.user_settings AS settings
    ON settings.user_id = requested.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_timeblock_context_marker_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_timeblock_context_marker_v1(UUID)
  TO service_role;

REVOKE TRUNCATE ON TABLE public.plans, public.records FROM service_role;

CREATE FUNCTION private.assert_timeblock_revision_acl_v1()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.has_table_privilege('service_role', 'public.plans', 'TRUNCATE')
    OR pg_catalog.has_table_privilege('service_role', 'public.records', 'TRUNCATE')
    OR pg_catalog.has_table_privilege(
      'service_role',
      'private.timeblock_user_revisions',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      'service_role',
      'private.timeblock_transaction_states',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      'service_role',
      'private.timeblock_transaction_revision_bumps',
      'SELECT'
    ) THEN
    RAISE EXCEPTION 'Timeblock revision effective privileges are unsafe'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_timeblock_revision_acl_v1()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT private.assert_timeblock_revision_acl_v1();

-- =============================================================================
-- 7. Trigger installation (bounded by the migration-level lock timeout)
-- =============================================================================

CREATE TRIGGER trigger_guard_direct_plan_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.plans
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.guard_direct_timeblock_statement_v1();

CREATE TRIGGER trigger_guard_direct_record_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.records
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.guard_direct_timeblock_statement_v1();

-- This name sorts after trigger_lock_authenticated_tag_write so authenticated
-- tag deletes bind their supported user before this direct-write guard runs.
CREATE TRIGGER trigger_serialize_direct_tag_delete
  BEFORE DELETE ON public.tags
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.guard_direct_timeblock_statement_v1();

CREATE TRIGGER trigger_assert_plan_writer_user
  BEFORE INSERT OR UPDATE OR DELETE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION private.assert_timeblock_writer_row_v1();

CREATE TRIGGER trigger_assert_record_writer_user
  BEFORE INSERT OR UPDATE OR DELETE ON public.records
  FOR EACH ROW
  EXECUTE FUNCTION private.assert_timeblock_writer_row_v1();

CREATE TRIGGER trigger_assert_tag_delete_writer_user
  BEFORE DELETE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION private.assert_timeblock_writer_row_v1();

CREATE CONSTRAINT TRIGGER trigger_bump_plan_revision_after_insert
  AFTER INSERT ON public.plans
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_timeblock_revision_from_row_v1();

CREATE CONSTRAINT TRIGGER trigger_bump_plan_revision_after_update
  AFTER UPDATE ON public.plans
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION private.bump_timeblock_revision_from_row_v1();

CREATE CONSTRAINT TRIGGER trigger_bump_plan_revision_after_delete
  AFTER DELETE ON public.plans
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_timeblock_revision_from_row_v1();

CREATE CONSTRAINT TRIGGER trigger_bump_record_revision_after_insert
  AFTER INSERT ON public.records
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_timeblock_revision_from_row_v1();

CREATE CONSTRAINT TRIGGER trigger_bump_record_revision_after_update
  AFTER UPDATE ON public.records
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION private.bump_timeblock_revision_from_row_v1();

CREATE CONSTRAINT TRIGGER trigger_bump_record_revision_after_delete
  AFTER DELETE ON public.records
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.bump_timeblock_revision_from_row_v1();

COMMENT ON FUNCTION public.get_timeblock_context_marker_v1(UUID) IS
  'Returns one user-scoped Plan / Record revision, database time, and timezone; service role only.';
COMMENT ON FUNCTION private.guard_direct_timeblock_statement_v1() IS
  'Binds current direct Product Plan / Record writes for revision tracking without changing their concurrency.';
COMMENT ON FUNCTION private.assert_timeblock_writer_row_v1() IS
  'Rejects mixed-user writes before a supported transaction mutates another user row.';
COMMENT ON FUNCTION private.bump_timeblock_user_revision_v1(UUID) IS
  'Advances an initialized user revision at most once per transaction.';



-- Use the pooled-backend-safe cleanup implementation.
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


-- Reject unsupported shared-to-exclusive upgrades before user locks.
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
COMMENT ON FUNCTION private.lock_timeblock_user_write_shared_v1(UUID) IS
  'Acquires a shared user-scoped lock without reversing the domain-row / revision-row lock order.';
COMMENT ON FUNCTION private.lock_timeblock_user_write_exclusive_v1(UUID) IS
  'Acquires an exclusive user-scoped lock without reversing the domain-row / revision-row lock order.';

-- Close the installation gap between the existing-user backfill and the
-- future-user trigger. Keeping this block next to COMMIT minimizes how long
-- signups and account deletion wait for the table lock.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO private.timeblock_user_revisions (user_id)
SELECT app_user.id
FROM auth.users AS app_user;

CREATE FUNCTION private.initialize_timeblock_user_revision_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO private.timeblock_user_revisions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.cleanup_timeblock_user_revision_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.timeblock_user_revisions
  WHERE user_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.initialize_timeblock_user_revision_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.cleanup_timeblock_user_revision_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trigger_initialize_timeblock_user_revision
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.initialize_timeblock_user_revision_v1();

CREATE TRIGGER trigger_cleanup_timeblock_user_revision
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.cleanup_timeblock_user_revision_v1();



-- Account deletion participates in the same-user exclusive boundary. The
-- account-deletion business command remains Stage 3 and is not included.
CREATE FUNCTION private.lock_timeblock_user_before_account_delete_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
BEGIN
  PERFORM private.lock_timeblock_user_write_exclusive_v1(OLD.id);
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.lock_timeblock_user_before_account_delete_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trigger_lock_timeblock_user_before_account_delete
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.lock_timeblock_user_before_account_delete_v1();


COMMIT;
