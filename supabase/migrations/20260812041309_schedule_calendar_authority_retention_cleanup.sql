-- private.cleanup_calendar_authority_retention_internal_v1 was added by
-- 20260730090015_fenced_calendar_revoke_worker.sql but nothing ever called it.
-- calendar_revoke_operations / calendar_authority_command_receipts /
-- calendar_oauth_attempts rows past their delete_after, and orphaned subject
-- fences, accumulated indefinitely instead of being purged at the documented
-- 90-day retention window (#1994).

BEGIN;

-- pg_cron runs as the migration owner and can call the private routine even
-- though no application role has EXECUTE (same pattern as
-- expire-calendar-revoke-outbox in 20260730090003_harden_calendar_revoke_expiry.sql).
-- Recreate by name so reset/rehearsal and roll-forward repair cannot leave
-- duplicate jobs.
--
-- pg_cron's uniqueness key is (jobname, username), not jobname alone. If the
-- Dashboard-drift issue (#1879) ever creates a same-named job under a
-- different role, a bare "WHERE jobname = ..." SELECT INTO would silently
-- pick one arbitrary row and could either fail (unschedule on a job we don't
-- own) or leave a foreign duplicate running alongside ours. Scope to
-- current_user and fail loudly instead of guessing.
DO $$
DECLARE
  v_job RECORD;
  v_foreign_count INTEGER;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_foreign_count
  FROM cron.job AS job
  WHERE job.jobname = 'cleanup-calendar-authority-retention'
    AND job.username <> current_user;

  IF v_foreign_count > 0 THEN
    RAISE EXCEPTION
      'cron job "cleanup-calendar-authority-retention" already exists under a different role (Dashboard drift?); resolve manually before re-running this migration'
      USING ERRCODE = '55006';
  END IF;

  FOR v_job IN
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname = 'cleanup-calendar-authority-retention'
      AND job.username = current_user
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  -- Daily, staggered after the other retention cleanups registered in
  -- 00000000000000_baseline.sql (:00/:10/:20/:30) and
  -- 20260802013954_add_product_events.sql (:40). This is a 90-day retention
  -- window, not a latency-sensitive purge, so daily is sufficient.
  PERFORM cron.schedule(
    'cleanup-calendar-authority-retention',
    '50 3 * * *',
    'SELECT private.cleanup_calendar_authority_retention_internal_v1(1000)'
  );
END;
$$;

COMMIT;
