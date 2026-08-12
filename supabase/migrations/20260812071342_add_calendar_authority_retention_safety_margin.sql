-- Codex round 3 (#2000): cleanup runs hourly but delete_after is exactly
-- created_at/settled_at + 90 days. A row whose delete_after lands just after
-- a run isn't caught until the next scheduled run (~1h later), and a single
-- missed/failed run pushes that out by another interval — the "does not
-- retain beyond 90 days" promise (privacy.mdx, PR #1998) could be violated
-- by run-interval jitter alone, independent of any application bug.
--
-- Closes the whole class with one constant instead of chasing individual
-- overshoot scenarios: purge a row once it is within RETENTION_SAFETY_MARGIN
-- of its delete_after, not only once delete_after has strictly passed.
-- Purging early is always safe against a "do not retain past X" promise;
-- the only requirement is that consecutive successful cron runs are never
-- more than RETENTION_SAFETY_MARGIN apart. At hourly cadence, 4 hours
-- absorbs up to ~3 consecutive missed/failed runs before the promise could
-- be violated, at negligible cost against a 90-day retention window.

BEGIN;

CREATE OR REPLACE FUNCTION private.cleanup_calendar_authority_retention_internal_v1(
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
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
  -- See migration header for why this exists and how the bound is derived.
  v_margin CONSTANT INTERVAL := INTERVAL '4 hours';
  v_deleted INTEGER;
  v_total_deleted INTEGER := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Calendar authority cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  LOCK TABLE private.calendar_authority_projects IN SHARE MODE;

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.scope_kind = 'project'
  ORDER BY project.project_key
  FOR UPDATE;

  WITH candidates AS MATERIALIZED (
    SELECT operation.operation_id
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.state IN ('revoked', 'expired')
      AND operation.delete_after <= v_now + v_margin
    ORDER BY operation.delete_after, operation.operation_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.calendar_revoke_operations AS operation
  USING candidates
  WHERE operation.operation_id = candidates.operation_id
    AND operation.state IN ('revoked', 'expired')
    AND operation.delete_after <= v_now + v_margin;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_total_deleted := v_total_deleted + v_deleted;

  WITH candidates AS MATERIALIZED (
    SELECT receipt.operation_id
    FROM private.calendar_authority_command_receipts AS receipt
    WHERE receipt.delete_after <= v_now + v_margin
    ORDER BY receipt.delete_after, receipt.operation_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.calendar_authority_command_receipts AS receipt
  USING candidates
  WHERE receipt.operation_id = candidates.operation_id
    AND receipt.delete_after <= v_now + v_margin;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_total_deleted := v_total_deleted + v_deleted;

  WITH candidates AS MATERIALIZED (
    SELECT attempt.id
    FROM private.calendar_oauth_attempts AS attempt
    WHERE attempt.delete_after <= v_now + v_margin
    ORDER BY attempt.delete_after, attempt.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.calendar_oauth_attempts AS attempt
  USING candidates
  WHERE attempt.id = candidates.id
    AND attempt.delete_after <= v_now + v_margin;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_total_deleted := v_total_deleted + v_deleted;

  -- Orphaned subject fences have no delete_after (no retention deadline to
  -- race against) — unaffected by the margin.
  WITH candidates AS MATERIALIZED (
    SELECT subject.id
    FROM private.calendar_authority_fences AS subject
    WHERE subject.scope_kind = 'subject'
      AND subject.state = 'ready'
      AND NOT EXISTS (
        SELECT 1
        FROM public.calendar_connections AS connection
        WHERE connection.authority_fence_id = subject.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM private.calendar_revoke_operations AS operation
        WHERE operation.subject_fence_id = subject.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM private.calendar_authority_command_receipts AS receipt
        WHERE receipt.subject_fence_id = subject.id
      )
    ORDER BY subject.changed_at, subject.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.calendar_authority_fences AS subject
  USING candidates
  WHERE subject.id = candidates.id
    AND subject.scope_kind = 'subject';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_total_deleted + v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION
  private.cleanup_calendar_authority_retention_internal_v1(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION
  private.cleanup_calendar_authority_retention_internal_v1(INTEGER) IS
  'Performs owner-only bounded retention cleanup for Calendar authority metadata without requiring an application JWT. Purges rows within a 4-hour safety margin of delete_after, not only strictly past it, so hourly cron jitter cannot push actual retention beyond the documented 90-day promise.';

COMMIT;
