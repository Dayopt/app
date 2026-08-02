-- Minimal, payload-free product analytics with a bounded 90-day retention window.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL
    CHECK (
      event_name IN (
        'user_signed_up',
        'plan_created',
        'record_created',
        'review_opened',
        'checkout_started',
        'subscription_started'
      )
    ),
  properties JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (properties = '{}'::JSONB),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX product_events_created_at_idx
  ON public.product_events (created_at);

CREATE INDEX product_events_user_created_at_idx
  ON public.product_events (user_id, created_at DESC);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_events FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE public.product_events TO service_role;

CREATE POLICY product_events_deny_browser_access
  ON public.product_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

CREATE FUNCTION private.track_product_user_signup_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.product_events (user_id, event_name, properties)
    VALUES (NEW.id, 'user_signed_up', '{}'::JSONB);
  EXCEPTION
    WHEN OTHERS THEN
      -- Analytics must never block account creation. Keep the warning payload-free.
      RAISE WARNING 'Product signup analytics insert failed';
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.track_product_user_signup_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER track_product_user_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.track_product_user_signup_v1();

CREATE FUNCTION private.cleanup_product_events_v1(
  p_limit INTEGER DEFAULT 10000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Invalid product event cleanup limit'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT event.id
    FROM public.product_events AS event
    WHERE event.created_at < pg_catalog.clock_timestamp() - INTERVAL '90 days'
    ORDER BY event.created_at, event.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.product_events AS event
    USING candidates
    WHERE event.id = candidates.id
    RETURNING event.id
  )
  SELECT pg_catalog.count(*)::INTEGER
  INTO deleted_count
  FROM deleted;

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION private.cleanup_product_events_v1(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  FOR existing_job_id IN
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname = 'cleanup-product-events'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'cleanup-product-events',
  '40 3 * * *',
  $job$SELECT private.cleanup_product_events_v1(10000)$job$
);

DO $$
BEGIN
  IF NOT pg_catalog.has_table_privilege('service_role', 'public.product_events', 'INSERT') THEN
    RAISE EXCEPTION 'service_role must have product_events INSERT';
  END IF;

  IF pg_catalog.has_table_privilege('service_role', 'public.product_events', 'SELECT')
    OR pg_catalog.has_table_privilege('service_role', 'public.product_events', 'UPDATE')
    OR pg_catalog.has_table_privilege('service_role', 'public.product_events', 'DELETE')
    OR pg_catalog.has_table_privilege('service_role', 'public.product_events', 'TRUNCATE')
    OR pg_catalog.has_table_privilege('service_role', 'public.product_events', 'REFERENCES')
    OR pg_catalog.has_table_privilege('service_role', 'public.product_events', 'TRIGGER') THEN
    RAISE EXCEPTION 'service_role product_events privilege surface is too broad';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.product_events', 'SELECT')
    OR pg_catalog.has_table_privilege('anon', 'public.product_events', 'INSERT')
    OR pg_catalog.has_table_privilege('anon', 'public.product_events', 'UPDATE')
    OR pg_catalog.has_table_privilege('anon', 'public.product_events', 'DELETE')
    OR pg_catalog.has_table_privilege('authenticated', 'public.product_events', 'SELECT')
    OR pg_catalog.has_table_privilege('authenticated', 'public.product_events', 'INSERT')
    OR pg_catalog.has_table_privilege('authenticated', 'public.product_events', 'UPDATE')
    OR pg_catalog.has_table_privilege('authenticated', 'public.product_events', 'DELETE') THEN
    RAISE EXCEPTION 'browser roles must not access product_events';
  END IF;
END;
$$;

COMMENT ON TABLE public.product_events IS
  'Payload-free allowlisted product events retained for 90 days.';
COMMENT ON COLUMN public.product_events.properties IS
  'Reserved for future schema evolution; constrained to an empty object to forbid PII.';
COMMENT ON FUNCTION private.track_product_user_signup_v1() IS
  'Best-effort auth.users signup event writer; failures never block account creation.';
COMMENT ON FUNCTION private.cleanup_product_events_v1(INTEGER) IS
  'Deletes at most 10000 product events older than 90 days; DB owner maintenance only.';

COMMIT;
