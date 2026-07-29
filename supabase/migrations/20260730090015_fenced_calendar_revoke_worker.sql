-- Draft: exact-lease Calendar revoke worker state machine. Ciphertext expiry
-- and authority-fence settlement are intentionally separate.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION private.expire_calendar_revoke_outbox_legacy_unbound_internal_v1(
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
  v_expired INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Calendar revoke expiry limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT queued.id
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.authority_fence_id IS NULL
      AND queued.authority_epoch IS NULL
      AND queued.expires_at <= v_now
    ORDER BY queued.expires_at, queued.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  deleted AS (
    DELETE FROM private.calendar_revoke_outbox AS queued
    USING candidates
    WHERE queued.id = candidates.id
      AND queued.authority_fence_id IS NULL
      AND queued.authority_epoch IS NULL
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

REVOKE ALL ON FUNCTION
  private.expire_calendar_revoke_outbox_legacy_unbound_internal_v1(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION
  private.expire_calendar_revoke_outbox_legacy_unbound_internal_v1(INTEGER) IS
  'Expires only pre-fence Calendar ciphertext during expand/contract rollout; owner-only.';

CREATE FUNCTION public.claim_calendar_revoke_outbox_v2(
  p_project_key TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  outbox_id UUID,
  lease_id UUID,
  provider TEXT,
  refresh_token_enc TEXT,
  expires_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  attempt_deadline_at TIMESTAMPTZ,
  attempt_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_candidate RECORD;
  v_operation RECORD;
  v_queued RECORD;
  v_lease_id UUID;
  v_lease_expires_at TIMESTAMPTZ;
  v_claim_now TIMESTAMPTZ;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_returned INTEGER := 0;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.resolve_calendar_authority_project_fence_v1(p_project_key);

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Calendar revoke claim limit must be between 1 and 100'
      USING ERRCODE = '22023';
  END IF;

  FOR v_candidate IN
    SELECT
      operation.operation_id,
      operation.project_fence_id,
      operation.subject_fence_id
    FROM private.calendar_revoke_operations AS operation
    JOIN private.calendar_authority_fences AS project
      ON project.id = operation.project_fence_id
     AND project.project_key = p_project_key
    JOIN private.calendar_revoke_outbox AS queued
      ON queued.id = operation.operation_id
    WHERE operation.state = 'pending'
      AND (
        operation.active_lease_id IS NULL
        OR operation.active_lease_expires_at <= v_now
      )
      AND (
        operation.guard_until IS NULL
        OR operation.guard_until <= v_now
      )
      AND queued.expires_at > v_now + INTERVAL '30 seconds'
      AND queued.available_at <= v_now
      AND (
        queued.lease_id IS NULL
        OR queued.lease_expires_at <= v_now
      )
      AND NOT EXISTS (
        SELECT 1
        FROM private.calendar_account_deletion_intents AS intent
        WHERE intent.user_id = operation.source_user_id
          AND (
            intent.state = 'ready'
            OR intent.expires_at > v_now
          )
      )
    ORDER BY queued.available_at, queued.created_at, queued.id
    LIMIT p_limit
  LOOP
    PERFORM 1
    FROM private.calendar_authority_fences AS project
    WHERE project.id = v_candidate.project_fence_id
      AND project.project_key = p_project_key
      AND project.scope_kind = 'project'
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    PERFORM 1
    FROM private.calendar_authority_fences AS subject
    WHERE subject.id = v_candidate.subject_fence_id
      AND subject.project_key = p_project_key
      AND subject.scope_kind IN ('subject', 'quarantine')
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT
      operation.operation_id,
      operation.state,
      operation.active_lease_id,
      operation.active_lease_expires_at,
      operation.guard_until,
      operation.source_user_id,
      operation.source_connection_id,
      operation.subject_fence_epoch
    INTO v_operation
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.operation_id = v_candidate.operation_id
      AND operation.project_fence_id = v_candidate.project_fence_id
      AND operation.subject_fence_id = v_candidate.subject_fence_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_operation.state IS DISTINCT FROM 'pending'
      OR (
        v_operation.active_lease_id IS NOT NULL
        AND v_operation.active_lease_expires_at > v_now
      )
      OR (
        v_operation.guard_until IS NOT NULL
        AND v_operation.guard_until > v_now
      ) THEN
      CONTINUE;
    END IF;

    SELECT
      queued.id,
      queued.provider,
      queued.refresh_token_enc,
      queued.expires_at,
      queued.available_at,
      queued.lease_id,
      queued.lease_expires_at,
      queued.attempt_count,
      queued.user_id,
      queued.source_connection_id,
      queued.authority_epoch
    INTO v_queued
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id = v_candidate.operation_id
      AND queued.authority_fence_id = v_candidate.subject_fence_id
      AND queued.expires_at > v_now
      AND queued.available_at <= v_now
      AND (
        queued.lease_id IS NULL
        OR queued.lease_expires_at <= v_now
      )
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_claim_now := pg_catalog.clock_timestamp();

    IF v_operation.state IS DISTINCT FROM 'pending'
      OR (
        v_operation.active_lease_id IS NOT NULL
        AND v_operation.active_lease_expires_at > v_claim_now
      )
      OR (
        v_operation.guard_until IS NOT NULL
        AND v_operation.guard_until > v_claim_now
      )
      OR v_queued.expires_at <= v_claim_now + INTERVAL '30 seconds'
      OR v_queued.available_at > v_claim_now
      OR (
        v_queued.lease_id IS NOT NULL
        AND v_queued.lease_expires_at > v_claim_now
      )
      OR v_queued.user_id IS DISTINCT FROM v_operation.source_user_id
      OR v_queued.source_connection_id
        IS DISTINCT FROM v_operation.source_connection_id
      OR v_queued.authority_epoch
        IS DISTINCT FROM v_operation.subject_fence_epoch
      OR EXISTS (
        SELECT 1
        FROM private.calendar_account_deletion_intents AS intent
        WHERE intent.user_id = v_operation.source_user_id
          AND (
            intent.state = 'ready'
            OR intent.expires_at > v_claim_now
          )
      ) THEN
      CONTINUE;
    END IF;

    v_lease_id := gen_random_uuid();
    v_lease_expires_at := v_claim_now + INTERVAL '2 minutes';

    UPDATE private.calendar_revoke_operations AS operation
    SET active_lease_id = v_lease_id,
        active_lease_expires_at = v_lease_expires_at
    WHERE operation.operation_id = v_candidate.operation_id;

    UPDATE private.calendar_revoke_outbox AS queued
    SET lease_id = v_lease_id,
        lease_expires_at = v_lease_expires_at,
        attempt_count = queued.attempt_count + 1
    WHERE queued.id = v_candidate.operation_id
    RETURNING queued.attempt_count INTO attempt_count;

    outbox_id := v_candidate.operation_id;
    lease_id := v_lease_id;
    provider := v_queued.provider;
    refresh_token_enc := v_queued.refresh_token_enc;
    expires_at := v_queued.expires_at;
    lease_expires_at := v_lease_expires_at;
    attempt_deadline_at := LEAST(
      v_queued.expires_at - INTERVAL '10 seconds',
      v_lease_expires_at - INTERVAL '10 seconds'
    );
    v_returned := v_returned + 1;
    RETURN NEXT;

    EXIT WHEN v_returned >= p_limit;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_calendar_revoke_outbox_v2(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_calendar_revoke_outbox_v2(TEXT, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.claim_calendar_revoke_outbox_v2(TEXT, INTEGER) IS
  'Claims subject-fenced Calendar revoke work with an exact two-minute lease and provider deadline; service role only.';

CREATE FUNCTION public.claim_calendar_revoke_direct_attempt_v1(
  p_project_key TEXT,
  p_operation_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  attempt_deadline_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_operation private.calendar_revoke_operations%ROWTYPE;
  v_now TIMESTAMPTZ;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid direct Calendar revoke claim'
      USING ERRCODE = '22023';
  END IF;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  JOIN private.calendar_authority_fences AS project
    ON project.id = operation.project_fence_id
   AND project.project_key = p_project_key
  WHERE operation.operation_id = p_operation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_operation.project_fence_id
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_operation.subject_fence_id
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id
  FOR UPDATE;

  v_now := pg_catalog.clock_timestamp();

  IF v_operation.source_user_id IS DISTINCT FROM p_user_id
    OR v_operation.operation_kind IS DISTINCT FROM 'token_rotation_recovery'
    OR v_operation.state IS DISTINCT FROM 'pending'
    OR v_operation.expires_at <= v_now + INTERVAL '30 seconds'
    OR (
      v_operation.active_lease_id IS NOT NULL
      AND v_operation.active_lease_expires_at > v_now
    )
    OR (
      v_operation.guard_until IS NOT NULL
      AND v_operation.guard_until > v_now
    )
    OR EXISTS (
      SELECT 1
      FROM private.calendar_revoke_outbox AS queued
      WHERE queued.id = p_operation_id
    ) THEN
    RETURN;
  END IF;

  lease_id := gen_random_uuid();
  lease_expires_at := LEAST(
    v_now + INTERVAL '2 minutes',
    v_operation.expires_at
  );
  attempt_deadline_at := lease_expires_at - INTERVAL '10 seconds';

  UPDATE private.calendar_revoke_operations AS operation
  SET active_lease_id = lease_id,
      active_lease_expires_at = lease_expires_at
  WHERE operation.operation_id = p_operation_id;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_calendar_revoke_direct_attempt_v1(
  TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_calendar_revoke_direct_attempt_v1(
  TEXT, UUID, UUID
) TO service_role;

COMMENT ON FUNCTION public.claim_calendar_revoke_direct_attempt_v1(
  TEXT, UUID, UUID
) IS
  'Claims one no-ciphertext recovery attempt before a direct provider revoke; service role only.';

CREATE FUNCTION public.finalize_calendar_revoke_attempt_v2(
  p_project_key TEXT,
  p_outbox_id UUID,
  p_lease_id UUID,
  p_outcome TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_operation private.calendar_revoke_operations%ROWTYPE;
  v_project_key TEXT;
  v_queued RECORD;
  v_delay_seconds INTEGER;
  v_guard_until TIMESTAMPTZ;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_outbox_id IS NULL
    OR p_lease_id IS NULL
    OR p_outcome NOT IN ('confirmed', 'not_started', 'unconfirmed') THEN
    RAISE EXCEPTION 'Invalid Calendar revoke attempt finalization'
      USING ERRCODE = '22023';
  END IF;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_outbox_id;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  SELECT project.project_key
  INTO v_project_key
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_operation.project_fence_id
    AND project.scope_kind = 'project';

  IF NOT FOUND OR v_project_key IS DISTINCT FROM p_project_key THEN
    RETURN 'missing';
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_operation.project_fence_id
    AND project.project_key = p_project_key
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_operation.subject_fence_id
    AND subject.project_key = p_project_key
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_outbox_id
  FOR UPDATE;

  IF v_operation.operation_kind = 'account_delete' THEN
    RAISE EXCEPTION 'Use the account deletion finalizer'
      USING ERRCODE = 'CA019';
  END IF;

  IF v_operation.state IN ('revoke_guarded', 'revoked', 'expired') THEN
    RETURN v_operation.state;
  END IF;

  IF v_operation.active_lease_id IS DISTINCT FROM p_lease_id
    OR v_operation.active_lease_expires_at IS NULL THEN
    RETURN 'superseded';
  END IF;

  SELECT
    queued.lease_id,
    queued.lease_expires_at,
    queued.expires_at,
    queued.attempt_count
  INTO v_queued
  FROM private.calendar_revoke_outbox AS queued
  WHERE queued.id = p_outbox_id
  FOR UPDATE;

  IF FOUND AND (
    v_queued.lease_id IS DISTINCT FROM p_lease_id
    OR v_queued.lease_expires_at IS DISTINCT FROM v_operation.active_lease_expires_at
  ) THEN
    RETURN 'superseded';
  END IF;

  IF p_outcome = 'confirmed' THEN
    DELETE FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id = p_outbox_id
      AND queued.lease_id = p_lease_id;

    UPDATE private.calendar_revoke_operations AS operation
    SET state = 'revoke_guarded',
        active_lease_id = NULL,
        active_lease_expires_at = NULL,
        guard_until = GREATEST(
          COALESCE(operation.guard_until, '-infinity'::TIMESTAMPTZ),
          v_now + INTERVAL '10 minutes'
        )
    WHERE operation.operation_id = p_outbox_id;

    RETURN 'revoke_guarded';
  END IF;

  IF p_outcome = 'not_started' THEN
    IF v_operation.state = 'expiry_guarded'
      OR (FOUND AND v_queued.expires_at <= v_now) THEN
      DELETE FROM private.calendar_revoke_outbox AS queued
      WHERE queued.id = p_outbox_id
        AND queued.lease_id = p_lease_id;

      PERFORM private.settle_calendar_revoke_operation_v1(
        p_outbox_id,
        'expired',
        v_now
      );

      IF v_operation.source_user_id IS NOT NULL THEN
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

      RETURN 'expired';
    END IF;

    UPDATE private.calendar_revoke_operations AS operation
    SET active_lease_id = NULL,
        active_lease_expires_at = NULL
    WHERE operation.operation_id = p_outbox_id;

    UPDATE private.calendar_revoke_outbox AS queued
    SET available_at = v_now + INTERVAL '30 seconds',
        lease_id = NULL,
        lease_expires_at = NULL
    WHERE queued.id = p_outbox_id
      AND queued.lease_id = p_lease_id;

    RETURN 'retried';
  END IF;

  v_guard_until := GREATEST(
    COALESCE(v_operation.guard_until, '-infinity'::TIMESTAMPTZ),
    v_operation.active_lease_expires_at + INTERVAL '10 minutes',
    v_now + INTERVAL '10 minutes'
  );

  IF v_operation.state = 'expiry_guarded'
    OR NOT FOUND
    OR v_queued.expires_at <= v_now THEN
    DELETE FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id = p_outbox_id
      AND queued.lease_id = p_lease_id;

    UPDATE private.calendar_revoke_operations AS operation
    SET state = 'expiry_guarded',
        active_lease_id = NULL,
        active_lease_expires_at = NULL,
        guard_until = v_guard_until
    WHERE operation.operation_id = p_outbox_id;

    RETURN 'expiry_guarded';
  END IF;

  v_delay_seconds := LEAST(
    3600,
    (
      30 * pg_catalog.power(
        2::NUMERIC,
        LEAST(GREATEST(v_queued.attempt_count - 1, 0), 7)::NUMERIC
      )
    )::INTEGER
  );

  UPDATE private.calendar_revoke_operations AS operation
  SET active_lease_id = NULL,
      active_lease_expires_at = NULL,
      guard_until = v_guard_until
  WHERE operation.operation_id = p_outbox_id;

  UPDATE private.calendar_revoke_outbox AS queued
  SET available_at = GREATEST(
        v_guard_until,
        LEAST(
          queued.expires_at,
          v_now + pg_catalog.make_interval(secs => v_delay_seconds)
        )
      ),
      lease_id = NULL,
      lease_expires_at = NULL
  WHERE queued.id = p_outbox_id
    AND queued.lease_id = p_lease_id;

  RETURN 'retried';
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_calendar_revoke_attempt_v2(
  TEXT, UUID, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_calendar_revoke_attempt_v2(
  TEXT, UUID, UUID, TEXT
) TO service_role;

COMMENT ON FUNCTION public.finalize_calendar_revoke_attempt_v2(
  TEXT, UUID, UUID, TEXT
) IS
  'Finalizes one exact Calendar revoke lease as confirmed, not-started, or unconfirmed without opening an uncertain fence; service role only.';

CREATE FUNCTION private.expire_calendar_revoke_operation_item_v1(
  p_operation_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operation private.calendar_revoke_operations%ROWTYPE;
  v_queued RECORD;
  v_guard_until TIMESTAMPTZ;
  v_has_active_attempt BOOLEAN;
BEGIN
  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF NOT FOUND OR v_operation.state IS DISTINCT FROM 'pending' THEN
    RETURN 0;
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_operation.project_fence_id
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_operation.subject_fence_id
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id
  FOR UPDATE;

  IF v_operation.state IS DISTINCT FROM 'pending'
    OR v_operation.expires_at > p_now THEN
    RETURN 0;
  END IF;

  SELECT
    queued.id,
    queued.lease_id,
    queued.lease_expires_at
  INTO v_queued
  FROM private.calendar_revoke_outbox AS queued
  WHERE queued.id = p_operation_id
  FOR UPDATE;

  v_has_active_attempt :=
    v_operation.active_lease_id IS NOT NULL
    OR v_queued.lease_id IS NOT NULL;

  v_guard_until := GREATEST(
    COALESCE(v_operation.guard_until, '-infinity'::TIMESTAMPTZ),
    COALESCE(v_operation.active_lease_expires_at, '-infinity'::TIMESTAMPTZ),
    COALESCE(v_queued.lease_expires_at, '-infinity'::TIMESTAMPTZ),
    CASE
      WHEN v_has_active_attempt
        THEN GREATEST(
          COALESCE(v_operation.active_lease_expires_at, p_now),
          COALESCE(v_queued.lease_expires_at, p_now)
        ) + INTERVAL '10 minutes'
      ELSE '-infinity'::TIMESTAMPTZ
    END
  );

  DELETE FROM private.calendar_revoke_outbox AS queued
  WHERE queued.id = p_operation_id;

  IF v_guard_until > p_now THEN
    UPDATE private.calendar_revoke_operations AS operation
    SET state = 'expiry_guarded',
        active_lease_id = COALESCE(
          operation.active_lease_id,
          v_queued.lease_id
        ),
        active_lease_expires_at = COALESCE(
          operation.active_lease_expires_at,
          v_queued.lease_expires_at
        ),
        guard_until = v_guard_until
    WHERE operation.operation_id = p_operation_id;
  ELSE
    PERFORM private.settle_calendar_revoke_operation_v1(
      p_operation_id,
      'expired',
      p_now
    );

    IF v_operation.source_user_id IS NOT NULL THEN
      INSERT INTO private.integration_security_events (
        user_id,
        event_kind,
        occurred_at
      ) VALUES (
        v_operation.source_user_id,
        'calendar_revoke_expired',
        p_now
      );
    END IF;
  END IF;

  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION private.expire_calendar_revoke_operation_item_v1(
  UUID, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.expire_calendar_revoke_authority_internal_v2(
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
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_expired INTEGER := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Calendar revoke expiry limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  FOR v_candidate IN
    SELECT operation.operation_id
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.state = 'pending'
      AND operation.expires_at <= v_now
      -- Account-deletion wrappers are owned by the deletion-intent normalizer.
      -- Generic expiry must still process their source disconnect/rotation
      -- operation, but expiring the wrapper itself would invalidate the exact
      -- cached lease before the application can durably start/finalize its one
      -- permitted provider attempt.
      AND operation.operation_kind <> 'account_delete'
    ORDER BY operation.expires_at, operation.operation_id
    LIMIT p_limit
  LOOP
    v_expired := v_expired
      + private.expire_calendar_revoke_operation_item_v1(
          v_candidate.operation_id,
          v_now
        );
  END LOOP;

  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION private.expire_calendar_revoke_authority_internal_v2(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.finalize_calendar_revoke_guards_internal_v1(
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
  END LOOP;

  RETURN v_finalized;
END;
$$;

REVOKE ALL ON FUNCTION private.finalize_calendar_revoke_guards_internal_v1(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.expire_calendar_revoke_authority_v2(
  p_project_key TEXT,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
  ciphertexts_deleted INTEGER,
  guards_finalized INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.resolve_calendar_authority_project_fence_v1(p_project_key);

  ciphertexts_deleted :=
    private.expire_calendar_revoke_authority_internal_v2(p_limit);
  guards_finalized :=
    private.finalize_calendar_revoke_guards_internal_v1(p_limit);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_calendar_revoke_authority_v2(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_calendar_revoke_authority_v2(TEXT, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.expire_calendar_revoke_authority_v2(TEXT, INTEGER) IS
  'Deletes expired Calendar ciphertext while retaining uncertain attempt guards, then finalizes elapsed guards; service role only.';

CREATE FUNCTION public.cleanup_calendar_revoke_operations_v1(
  p_project_key TEXT,
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_fence_id UUID;
  v_deleted INTEGER;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Calendar revoke receipt cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT operation.operation_id
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.project_fence_id = v_project_fence_id
      AND operation.state IN ('revoked', 'expired')
      AND operation.delete_after <= v_now
    ORDER BY operation.delete_after, operation.operation_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.calendar_revoke_operations AS operation
  USING candidates
  WHERE operation.operation_id = candidates.operation_id
    AND operation.state IN ('revoked', 'expired')
    AND operation.delete_after <= v_now;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_calendar_revoke_operations_v1(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_calendar_revoke_operations_v1(TEXT, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.cleanup_calendar_revoke_operations_v1(TEXT, INTEGER) IS
  'Deletes settled payload-free Calendar revoke tombstones after their bounded 90-day retention; service role only.';

CREATE FUNCTION public.cleanup_calendar_authority_retention_v1(
  p_project_key TEXT,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
  command_receipts_deleted INTEGER,
  oauth_attempts_deleted INTEGER,
  subject_fences_deleted INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
DECLARE
  v_project_fence_id UUID;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Calendar authority cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  WITH candidates AS MATERIALIZED (
    SELECT receipt.operation_id
    FROM private.calendar_authority_command_receipts AS receipt
    WHERE receipt.project_fence_id = v_project_fence_id
      AND receipt.delete_after <= v_now
    ORDER BY receipt.delete_after, receipt.operation_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.calendar_authority_command_receipts AS receipt
  USING candidates
  WHERE receipt.operation_id = candidates.operation_id
    AND receipt.delete_after <= v_now;

  GET DIAGNOSTICS command_receipts_deleted = ROW_COUNT;

  WITH candidates AS MATERIALIZED (
    SELECT attempt.id
    FROM private.calendar_oauth_attempts AS attempt
    WHERE attempt.project_fence_id = v_project_fence_id
      AND attempt.delete_after <= v_now
    ORDER BY attempt.delete_after, attempt.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.calendar_oauth_attempts AS attempt
  USING candidates
  WHERE attempt.id = candidates.id
    AND attempt.delete_after <= v_now;

  GET DIAGNOSTICS oauth_attempts_deleted = ROW_COUNT;

  WITH candidates AS MATERIALIZED (
    SELECT subject.id
    FROM private.calendar_authority_fences AS subject
    WHERE subject.project_key = p_project_key
      AND subject.scope_kind = 'subject'
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

  GET DIAGNOSTICS subject_fences_deleted = ROW_COUNT;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_calendar_authority_retention_v1(
  TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_calendar_authority_retention_v1(
  TEXT, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.cleanup_calendar_authority_retention_v1(
  TEXT, INTEGER
) IS
  'Deletes expired command receipts, OAuth attempts, and unreferenced Google subject fences in bounded batches; service role only.';

CREATE FUNCTION private.cleanup_calendar_authority_retention_internal_v1(
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
      AND operation.delete_after <= v_now
    ORDER BY operation.delete_after, operation.operation_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.calendar_revoke_operations AS operation
  USING candidates
  WHERE operation.operation_id = candidates.operation_id
    AND operation.state IN ('revoked', 'expired')
    AND operation.delete_after <= v_now;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_total_deleted := v_total_deleted + v_deleted;

  WITH candidates AS MATERIALIZED (
    SELECT receipt.operation_id
    FROM private.calendar_authority_command_receipts AS receipt
    WHERE receipt.delete_after <= v_now
    ORDER BY receipt.delete_after, receipt.operation_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.calendar_authority_command_receipts AS receipt
  USING candidates
  WHERE receipt.operation_id = candidates.operation_id
    AND receipt.delete_after <= v_now;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_total_deleted := v_total_deleted + v_deleted;

  WITH candidates AS MATERIALIZED (
    SELECT attempt.id
    FROM private.calendar_oauth_attempts AS attempt
    WHERE attempt.delete_after <= v_now
    ORDER BY attempt.delete_after, attempt.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.calendar_oauth_attempts AS attempt
  USING candidates
  WHERE attempt.id = candidates.id
    AND attempt.delete_after <= v_now;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_total_deleted := v_total_deleted + v_deleted;

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
  'Performs owner-only bounded retention cleanup for Calendar authority metadata without requiring an application JWT.';

COMMIT;
