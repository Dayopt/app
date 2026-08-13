-- private.expire_calendar_revoke_ciphertexts_internal_v1 (20260730090016) and
-- private.finalize_calendar_revoke_guards_internal_v1 (20260730090015) were
-- added to move a `calendar_revoke_operations` row through its full
-- lifecycle (pending -> {revoke_guarded, expiry_guarded, revoked, expired})
-- but nothing ever called either one (#2002). Wiring only the finalize half
-- (as 20260812041309 did for the orphan-fence/delete_after cleanup) is not
-- sufficient: finalize only settles rows already in `revoke_guarded` /
-- `expiry_guarded`, so a row stuck in `pending` past its `expires_at` would
-- stay `pending` forever and never reach the state `delete_after` requires
-- (state CHECK constraint on `calendar_revoke_operations`, 20260730090012).
-- Both halves must run for the 90-day retention promise
-- (apps/web/content/legal/{en,ja}/privacy.mdx, accountDeletion) to hold.
--
-- private.expire_calendar_revoke_authority_internal_v2 (20260730090015) is a
-- global, non-project-scoped predecessor of the same expiry logic. It has no
-- integration test coverage and no caller anywhere in the app; the
-- project-scoped `_ciphertexts_internal_v1` (20260730090016) is what
-- `public.expire_calendar_revoke_authority_v3` calls and what
-- `calendar-ciphertext-expiry-lock.integration.test.ts` exercises. Treat v2
-- as superseded-but-not-dropped and wire v3's internal function instead.

BEGIN;

-- pg_cron runs as the migration owner and can call the private routines even
-- though no application role has EXECUTE (same pattern as
-- expire-calendar-revoke-outbox in 20260730090003_harden_calendar_revoke_expiry.sql
-- and cleanup-calendar-authority-retention in 20260812041309).
--
-- `_ciphertexts_internal_v1` requires a non-NULL `p_project_fence_id` and
-- raises if it's NULL, so it can't be scheduled as a bare `SELECT fn(...)`
-- literal — the project fence id is a runtime UUID, not a migration-time
-- constant. Resolving it via `FROM private.calendar_authority_fences WHERE
-- scope_kind = 'project'` returns at most one row today because
-- `private.calendar_authority_projects.singleton` (20260730090012) is a true
-- PK-enforced singleton and every project fence is 1:1 with a project row
-- (`calendar_authority_fences_project_unique` mirrors that, it doesn't create
-- it). The query stays correct if that ever changes to multiple projects —
-- the function is called once per resolved fence row — and it's a no-op
-- (zero rows) before the sole project is provisioned, instead of raising on
-- every run.
DO $$
DECLARE
  v_job RECORD;
  v_foreign_count INTEGER;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_foreign_count
  FROM cron.job AS job
  WHERE job.jobname = 'expire-calendar-revoke-authority'
    AND job.username <> current_user;

  IF v_foreign_count > 0 THEN
    RAISE EXCEPTION
      'cron job "expire-calendar-revoke-authority" already exists under a different role (Dashboard drift?); resolve manually before re-running this migration'
      USING ERRCODE = '55006';
  END IF;

  FOR v_job IN
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname = 'expire-calendar-revoke-authority'
      AND job.username = current_user
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  -- Hourly, at :10 — five minutes before finalize (:15) and well before
  -- cleanup-calendar-authority-retention (:50), purely to avoid the three
  -- jobs' FOR UPDATE locks on the same project/subject fence rows
  -- overlapping in the same tick. This ordering is NOT a same-hour delivery
  -- guarantee: a row that expire guards this run typically won't be a
  -- finalize candidate until the following hour (guard_until is lease
  -- expiry + 10 minutes, risk-reviewer 2026-08-13), and finalize's
  -- delete_after is settled_at + 90 days regardless — cleanup's timing is
  -- unrelated to this hour's tick order.
  PERFORM cron.schedule(
    'expire-calendar-revoke-authority',
    '10 * * * *',
    $cron$SELECT private.expire_calendar_revoke_ciphertexts_internal_v1(fence.id, 1000) FROM private.calendar_authority_fences AS fence WHERE fence.scope_kind = 'project'$cron$
  );
END;
$$;

-- private.finalize_calendar_revoke_guards_internal_v1 is global (no project
-- scoping in its candidate query), matching cleanup-calendar-authority-retention's
-- shape — schedule it the same direct way.
DO $$
DECLARE
  v_job RECORD;
  v_foreign_count INTEGER;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_foreign_count
  FROM cron.job AS job
  WHERE job.jobname = 'finalize-calendar-revoke-guards'
    AND job.username <> current_user;

  IF v_foreign_count > 0 THEN
    RAISE EXCEPTION
      'cron job "finalize-calendar-revoke-guards" already exists under a different role (Dashboard drift?); resolve manually before re-running this migration'
      USING ERRCODE = '55006';
  END IF;

  FOR v_job IN
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname = 'finalize-calendar-revoke-guards'
      AND job.username = current_user
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  -- Hourly, at :15. See the rationale above the expire job for why this
  -- offset is spacing only, not a delivery-order guarantee.
  PERFORM cron.schedule(
    'finalize-calendar-revoke-guards',
    '15 * * * *',
    'SELECT private.finalize_calendar_revoke_guards_internal_v1(1000)'
  );
END;
$$;

COMMIT;
