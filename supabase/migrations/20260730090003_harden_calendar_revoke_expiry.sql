-- Preserve every acquired Google authority that may need revocation and enforce
-- revoke-only ciphertext expiry independently from application availability.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- A provider refresh may rotate while purge is in flight. The old token copied
-- by purge and the newly acquired token must both be revocable; deduplicating by
-- the former connection ID would silently discard one authority.
ALTER TABLE private.calendar_revoke_outbox
  DROP CONSTRAINT calendar_revoke_outbox_source_unique;

CREATE INDEX calendar_revoke_outbox_user_provider_idx
  ON private.calendar_revoke_outbox (user_id, provider, created_at);

COMMENT ON COLUMN private.calendar_revoke_outbox.source_connection_id IS
  'Correlation-only source authority ID. Multiple encrypted tokens from one former connection are allowed.';

-- Leave one minute of scheduling margin so a normally operating minute cron
-- removes ciphertext no later than 24 hours after capture.
ALTER TABLE private.calendar_revoke_outbox
  ALTER COLUMN expires_at
  SET DEFAULT (pg_catalog.clock_timestamp() + INTERVAL '23 hours 59 minutes');

UPDATE private.calendar_revoke_outbox AS queued
SET expires_at = LEAST(
  queued.expires_at,
  queued.created_at + INTERVAL '23 hours 59 minutes'
);

CREATE FUNCTION private.clamp_calendar_revoke_outbox_expiry_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.expires_at := LEAST(
    NEW.expires_at,
    NEW.created_at + INTERVAL '23 hours 59 minutes'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.clamp_calendar_revoke_outbox_expiry_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER clamp_calendar_revoke_outbox_expiry
  BEFORE INSERT OR UPDATE OF created_at, expires_at
  ON private.calendar_revoke_outbox
  FOR EACH ROW
  EXECUTE FUNCTION private.clamp_calendar_revoke_outbox_expiry_v1();

CREATE FUNCTION private.expire_calendar_revoke_outbox_internal_v1(
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_expired INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Calendar revoke expiry limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT queued.id
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.expires_at <= v_now
    ORDER BY queued.expires_at, queued.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  deleted AS (
    DELETE FROM private.calendar_revoke_outbox AS queued
    USING candidates
    WHERE queued.id = candidates.id
      AND queued.expires_at <= v_now
    RETURNING queued.user_id
  ),
  events AS (
    INSERT INTO private.integration_security_events (
      user_id,
      event_kind,
      occurred_at
    )
    SELECT
      deleted.user_id,
      'calendar_revoke_expired',
      v_now
    FROM deleted
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO v_expired
  FROM events;

  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION private.expire_calendar_revoke_outbox_internal_v1(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.expire_calendar_revoke_outbox_internal_v1(INTEGER) IS
  'Owner-only bounded ciphertext expiry used by pg_cron and the service-role wrapper.';

CREATE OR REPLACE FUNCTION public.expire_calendar_revoke_outbox_v1(
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN private.expire_calendar_revoke_outbox_internal_v1(p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_calendar_revoke_outbox_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_calendar_revoke_outbox_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.expire_calendar_revoke_outbox_v1(INTEGER) IS
  'Service-role wrapper for bounded Calendar revoke ciphertext expiry.';

-- pg_cron runs as the migration owner and can call the private routine even
-- though no application role has EXECUTE. Recreate by name so reset/rehearsal
-- and roll-forward repair cannot leave duplicate jobs.
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT job.jobid
  INTO v_job_id
  FROM cron.job AS job
  WHERE job.jobname = 'expire-calendar-revoke-outbox';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire-calendar-revoke-outbox',
    '* * * * *',
    'SELECT private.expire_calendar_revoke_outbox_internal_v1(1000)'
  );
END;
$$;

COMMIT;
