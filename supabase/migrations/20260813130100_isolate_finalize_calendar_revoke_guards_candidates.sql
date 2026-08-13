-- risk-reviewer (2026-08-13, external-calendar-retention 束): now that
-- 20260813130000 puts private.finalize_calendar_revoke_guards_internal_v1
-- (20260730090015) on an hourly cron, it has the same silent-failure shape
-- #2002 itself was — just one level deeper. Its sibling
-- expire_calendar_revoke_ciphertexts_internal_v1 (20260730090016) wraps each
-- candidate in its own subtransaction (BEGIN/EXCEPTION) so one bad row is
-- deferred to the next run instead of aborting the whole batch. finalize had
-- no such isolation: a single settle_calendar_revoke_operation_v1 call
-- hitting the CA012 pending-count invariant (20260730090013) or a lock_timeout
-- would abort the entire transaction, and every other guarded row in that
-- batch — however many, however overdue — would never be finalized either,
-- indefinitely, with nothing surfacing outside cron.job_run_details.
--
-- This adds the same per-candidate isolation to finalize, matching expire's
-- pattern. The return type and the finalized count it reports are unchanged
-- (the public wrapper `finalize_calendar_revoke_guards_v1` and existing
-- integration test coverage assert on it as a plain count), so this is a
-- drop-in replacement — a bug fix to an existing frozen PL/pgSQL function,
-- not a new interface.

BEGIN;

CREATE OR REPLACE FUNCTION private.finalize_calendar_revoke_guards_internal_v1(
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
DECLARE
  v_candidate RECORD;
  v_operation private.calendar_revoke_operations%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_finalized INTEGER := 0;
  v_sqlstate TEXT;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Calendar revoke guard limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  FOR v_candidate IN
    SELECT
      operation.operation_id,
      operation.project_fence_id,
      operation.subject_fence_id
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.state IN ('revoke_guarded', 'expiry_guarded')
      AND operation.guard_until <= v_now
    ORDER BY operation.guard_until, operation.operation_id
    LIMIT p_limit
  LOOP
    BEGIN
      PERFORM 1
      FROM private.calendar_authority_fences AS project
      WHERE project.id = v_candidate.project_fence_id
      FOR UPDATE;

      PERFORM 1
      FROM private.calendar_authority_fences AS subject
      WHERE subject.id = v_candidate.subject_fence_id
      FOR UPDATE;

      SELECT operation.*
      INTO v_operation
      FROM private.calendar_revoke_operations AS operation
      WHERE operation.operation_id = v_candidate.operation_id
      FOR UPDATE;

      IF NOT FOUND
        OR v_operation.state NOT IN ('revoke_guarded', 'expiry_guarded')
        OR v_operation.guard_until > v_now THEN
        CONTINUE;
      END IF;

      PERFORM private.settle_calendar_revoke_operation_v1(
        v_operation.operation_id,
        CASE
          WHEN v_operation.state = 'revoke_guarded' THEN 'revoked'
          ELSE 'expired'
        END,
        v_now
      );

      IF v_operation.state = 'expiry_guarded'
        AND v_operation.source_user_id IS NOT NULL THEN
        INSERT INTO private.integration_security_events (
          user_id,
          event_kind,
          occurred_at
        ) VALUES (
          v_operation.source_user_id,
          'calendar_revoke_expired',
          v_now
        );
      END IF;

      v_finalized := v_finalized + 1;
    EXCEPTION
      WHEN query_canceled THEN
        EXIT;
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
        RAISE WARNING
          'Calendar revoke guard finalization candidate deferred (sqlstate=%)',
          v_sqlstate;
    END;
  END LOOP;

  RETURN v_finalized;
END;
$$;

REVOKE ALL ON FUNCTION private.finalize_calendar_revoke_guards_internal_v1(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.finalize_calendar_revoke_guards_internal_v1(INTEGER) IS
  'Finalizes elapsed revoke_guarded/expiry_guarded Calendar revoke operations to their terminal state, one candidate per subtransaction so a single failure defers that row instead of aborting the batch; owner-only.';

COMMIT;
