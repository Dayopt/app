-- Process Calendar provider revocation after local purge and enforce bounded
-- retention for payload-free integration security events.
-- Generic OAuth cleanup remains deferred to the OAuth constraint candidates.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 2. Calendar revoke outbox claim / completion / retry / hard expiry
-- =============================================================================

CREATE FUNCTION public.claim_calendar_revoke_outbox_v1(
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  outbox_id UUID,
  lease_id UUID,
  provider TEXT,
  refresh_token_enc TEXT,
  expires_at TIMESTAMPTZ,
  attempt_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Calendar revoke claim limit must be between 1 and 100'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT queued.id
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.expires_at > v_now
      AND queued.available_at <= v_now
      AND (
        queued.lease_id IS NULL
        OR queued.lease_expires_at <= v_now
      )
    ORDER BY queued.available_at, queued.created_at, queued.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE private.calendar_revoke_outbox AS queued
  SET lease_id = gen_random_uuid(),
      lease_expires_at = v_now + INTERVAL '2 minutes',
      attempt_count = queued.attempt_count + 1
  FROM candidates
  WHERE queued.id = candidates.id
  RETURNING
    queued.id,
    queued.lease_id,
    queued.provider,
    queued.refresh_token_enc,
    queued.expires_at,
    queued.attempt_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_calendar_revoke_outbox_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_calendar_revoke_outbox_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.claim_calendar_revoke_outbox_v1(INTEGER) IS
  'Claims due encrypted Calendar revoke work with a two-minute lease; service role only.';

CREATE FUNCTION public.complete_calendar_revoke_outbox_v1(
  p_outbox_id UUID,
  p_lease_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_outbox_id IS NULL OR p_lease_id IS NULL THEN
    RAISE EXCEPTION 'Calendar revoke completion requires outbox and lease IDs'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM private.calendar_revoke_outbox AS queued
  WHERE queued.id = p_outbox_id
    AND queued.lease_id = p_lease_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_calendar_revoke_outbox_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_calendar_revoke_outbox_v1(UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.complete_calendar_revoke_outbox_v1(UUID, UUID) IS
  'Deletes one revoke-only ciphertext after provider revocation succeeds; service role only.';

CREATE FUNCTION public.retry_calendar_revoke_outbox_v1(
  p_outbox_id UUID,
  p_lease_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_user_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_attempt_count INTEGER;
  v_delay_seconds INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_outbox_id IS NULL OR p_lease_id IS NULL THEN
    RAISE EXCEPTION 'Calendar revoke retry requires outbox and lease IDs'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    queued.user_id,
    queued.expires_at,
    queued.attempt_count
  INTO
    v_user_id,
    v_expires_at,
    v_attempt_count
  FROM private.calendar_revoke_outbox AS queued
  WHERE queued.id = p_outbox_id
    AND queued.lease_id = p_lease_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_expires_at <= v_now THEN
    DELETE FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id = p_outbox_id
      AND queued.lease_id = p_lease_id;

    INSERT INTO private.integration_security_events (
      user_id,
      event_kind,
      occurred_at
    ) VALUES (
      v_user_id,
      'calendar_revoke_expired',
      v_now
    );

    RETURN 'expired';
  END IF;

  v_delay_seconds := LEAST(
    3600,
    (
      30 * pg_catalog.power(
        2::NUMERIC,
        LEAST(GREATEST(v_attempt_count - 1, 0), 7)::NUMERIC
      )
    )::INTEGER
  );

  UPDATE private.calendar_revoke_outbox AS queued
  SET available_at = LEAST(
        v_expires_at,
        v_now + pg_catalog.make_interval(secs => v_delay_seconds)
      ),
      lease_id = NULL,
      lease_expires_at = NULL
  WHERE queued.id = p_outbox_id
    AND queued.lease_id = p_lease_id;

  RETURN 'retried';
END;
$$;

REVOKE ALL ON FUNCTION public.retry_calendar_revoke_outbox_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_calendar_revoke_outbox_v1(UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.retry_calendar_revoke_outbox_v1(UUID, UUID) IS
  'Releases failed revoke work with bounded backoff, or expires its ciphertext and emits a payload-free event; service role only.';

CREATE FUNCTION public.expire_calendar_revoke_outbox_v1(
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
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

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

REVOKE ALL ON FUNCTION public.expire_calendar_revoke_outbox_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_calendar_revoke_outbox_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.expire_calendar_revoke_outbox_v1(INTEGER) IS
  'Deletes expired Calendar revoke ciphertext in a bounded batch and emits payload-free failure events; service role only.';

-- =============================================================================
-- =============================================================================
-- 3. Payload-free security-event retention cleanup
-- =============================================================================

CREATE FUNCTION public.cleanup_integration_security_events_v1(
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff CONSTANT TIMESTAMPTZ :=
    pg_catalog.clock_timestamp() - INTERVAL '90 days';
  v_deleted INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Integration security event cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT event.id
    FROM private.integration_security_events AS event
    WHERE event.occurred_at <= v_cutoff
    ORDER BY event.occurred_at, event.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.integration_security_events AS event
  USING candidates
  WHERE event.id = candidates.id
    AND event.occurred_at <= v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_integration_security_events_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_integration_security_events_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.cleanup_integration_security_events_v1(INTEGER) IS
  'Deletes payload-free integration security events after 90 days in a bounded batch; service role only.';

-- =============================================================================
-- 4. Aggregate-only maintenance status
-- =============================================================================

CREATE FUNCTION public.get_external_authority_maintenance_status_v1()
RETURNS TABLE (
  calendar_revoke_due BIGINT,
  calendar_revoke_total BIGINT,
  oldest_due_age_seconds BIGINT,
  authorization_codes_due BOOLEAN,
  access_tokens_due BOOLEAN,
  refresh_tokens_due BOOLEAN,
  connections_due BOOLEAN,
  receipts_due BOOLEAN,
  security_events_due BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT pg_catalog.count(*)
      FROM private.calendar_revoke_outbox AS queued
      WHERE queued.expires_at <= v_now
        OR (
          queued.available_at <= v_now
          AND (
            queued.lease_id IS NULL
            OR queued.lease_expires_at <= v_now
          )
        )
    ),
    (
      SELECT pg_catalog.count(*)
      FROM private.calendar_revoke_outbox
    ),
    COALESCE(
      (
        SELECT GREATEST(
          0,
          pg_catalog.floor(
            pg_catalog.date_part(
              'epoch',
              v_now - MIN(queued.available_at)
            )
          )::BIGINT
        )
        FROM private.calendar_revoke_outbox AS queued
        WHERE queued.available_at <= v_now
      ),
      0
    ),
    EXISTS (
      SELECT 1
      FROM public.oauth_authorization_codes AS code
      WHERE COALESCE(code.consumed_at, code.expires_at)
        <= v_now - INTERVAL '24 hours'
    ),
    EXISTS (
      SELECT 1
      FROM public.oauth_tokens AS token
      WHERE token.token_type = 'access'
        AND (
          CASE
            WHEN token.revoked_at IS NULL THEN token.expires_at
            WHEN token.revoked_at < token.expires_at THEN token.revoked_at
            ELSE token.expires_at
          END
        ) <= v_now - INTERVAL '24 hours'
    ),
    EXISTS (
      SELECT 1
      FROM public.oauth_tokens AS token
      WHERE token.token_type = 'refresh'
        AND LEAST(
          token.expires_at,
          COALESCE(token.rotated_at, 'infinity'::TIMESTAMPTZ),
          COALESCE(token.revoked_at, 'infinity'::TIMESTAMPTZ)
        ) <= v_now - INTERVAL '30 days'
    ),
    EXISTS (
      SELECT 1
      FROM public.oauth_connections AS connection
      WHERE (
        CASE
          WHEN connection.revoked_at IS NULL THEN connection.reauth_required_at
          WHEN connection.revoked_at < connection.reauth_required_at THEN connection.revoked_at
          ELSE connection.reauth_required_at
        END
      ) <= v_now - INTERVAL '90 days'
    ),
    EXISTS (
      SELECT 1
      FROM public.mcp_mutation_receipts AS receipt
      WHERE receipt.applied_at < v_now - INTERVAL '90 days'
    ),
    EXISTS (
      SELECT 1
      FROM private.integration_security_events AS event
      WHERE event.occurred_at <= v_now - INTERVAL '90 days'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_external_authority_maintenance_status_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_external_authority_maintenance_status_v1()
  TO service_role;

COMMENT ON FUNCTION public.get_external_authority_maintenance_status_v1() IS
  'Returns aggregate-only revoke backlog and retention due flags without IDs or payloads; service role only.';

COMMIT;
