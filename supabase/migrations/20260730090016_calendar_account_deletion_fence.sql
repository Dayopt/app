-- Draft: prepare exactly one bounded provider revoke attempt per Calendar
-- connection before auth.users deletion, without retaining token ciphertext
-- after the account row is removed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.begin_calendar_account_deletion_v1(
  p_deletion_id UUID,
  p_project_key TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  deletion_id UUID,
  item_kind TEXT,
  item_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_project_fence_id UUID;
  v_existing private.calendar_account_deletion_intents%ROWTYPE;
  v_canonical_deletion_id UUID;
  v_operation RECORD;
  v_normalize_result TEXT;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_deletion_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar account deletion input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT intent.*
  INTO v_existing
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = p_user_id
  FOR UPDATE;

  IF FOUND
    AND (
      v_existing.state = 'ready'
      OR v_existing.expires_at > v_now
    ) THEN
    v_canonical_deletion_id := v_existing.deletion_id;

    IF v_existing.state = 'ready' THEN
      deletion_id := v_canonical_deletion_id;
      item_kind := 'none';
      item_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    RETURN QUERY
    WITH inventory AS (
      SELECT
        'connection'::TEXT AS item_kind,
        connection.id AS item_id
      FROM public.calendar_connections AS connection
      WHERE connection.user_id = p_user_id
      UNION ALL
      SELECT
        'outbox'::TEXT,
        queued.id
      FROM private.calendar_revoke_outbox AS queued
      WHERE queued.user_id = p_user_id
    )
    SELECT
      v_canonical_deletion_id,
      inventory.item_kind,
      inventory.item_id
    FROM inventory
    UNION ALL
    SELECT
      v_canonical_deletion_id,
      'none'::TEXT,
      NULL::UUID
    WHERE NOT EXISTS (SELECT 1 FROM inventory)
    ORDER BY 2, 3;
    RETURN;
  END IF;

  IF FOUND THEN
    v_normalize_result :=
      private.normalize_calendar_account_deletion_intent_v1(
        p_user_id,
        v_existing.deletion_id,
        v_now,
        FALSE
      );

    IF v_normalize_result = 'in_flight' THEN
      RAISE EXCEPTION 'Calendar provider revoke is still in flight'
        USING ERRCODE = 'CA019';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_oauth_attempts AS attempt
    WHERE attempt.user_id = p_user_id
      AND attempt.claimed_at IS NOT NULL
      AND attempt.completed_at IS NULL
      AND attempt.claim_expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Calendar OAuth callback is still active'
      USING ERRCODE = 'CA019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
      AND (
        connection.provider <> 'google'
        OR connection.authority_fence_id IS NULL
        OR connection.authority_epoch IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Calendar account authority is not ready for deletion'
      USING ERRCODE = 'CA017';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_outbox AS queued
    LEFT JOIN private.calendar_revoke_operations AS operation
      ON operation.operation_id = queued.id
    LEFT JOIN private.calendar_authority_fences AS subject
      ON subject.id = queued.authority_fence_id
    WHERE queued.user_id = p_user_id
      AND (
        queued.provider <> 'google'
        OR queued.authority_fence_id IS NULL
        OR queued.authority_epoch IS NULL
        OR operation.operation_id IS NULL
        OR operation.project_fence_id IS DISTINCT FROM v_project_fence_id
        OR operation.subject_fence_id IS DISTINCT FROM queued.authority_fence_id
        OR subject.project_key IS DISTINCT FROM p_project_key
      )
  ) THEN
    RAISE EXCEPTION 'Calendar revoke backlog is not ready for account deletion'
      USING ERRCODE = 'CA017';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_outbox AS queued
    JOIN private.calendar_revoke_operations AS operation
      ON operation.operation_id = queued.id
    WHERE queued.user_id = p_user_id
      AND (
        (
          queued.lease_id IS NOT NULL
          AND queued.lease_expires_at + INTERVAL '10 minutes' > v_now
        )
        OR (
          operation.active_lease_id IS NOT NULL
          AND operation.active_lease_expires_at + INTERVAL '10 minutes' > v_now
        )
      )
  ) THEN
    RAISE EXCEPTION 'Calendar provider revoke is still in flight'
      USING ERRCODE = 'CA019';
  END IF;

  FOR v_operation IN
    SELECT operation.operation_id
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.source_user_id = p_user_id
      AND operation.state = 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM private.calendar_revoke_outbox AS queued
        WHERE queued.id = operation.operation_id
      )
      AND NOT (
        operation.operation_kind = 'account_delete'
        AND operation.account_deletion_item_kind = 'outbox'
        AND EXISTS (
          SELECT 1
          FROM private.calendar_revoke_outbox AS queued
          WHERE queued.id = operation.account_deletion_item_id
        )
      )
    ORDER BY operation.subject_fence_id, operation.operation_id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM private.calendar_revoke_operations AS operation
      WHERE operation.operation_id = v_operation.operation_id
        AND operation.active_lease_id IS NOT NULL
        AND operation.active_lease_expires_at + INTERVAL '10 minutes' > v_now
    ) THEN
      RAISE EXCEPTION 'Calendar provider revoke is still in flight'
        USING ERRCODE = 'CA019';
    END IF;

    PERFORM private.settle_calendar_revoke_operation_v1(
      v_operation.operation_id,
      'expired',
      v_now
    );
  END LOOP;

  INSERT INTO private.calendar_account_deletion_intents (
    user_id,
    deletion_id,
    project_fence_id,
    started_at,
    expires_at
  ) VALUES (
    p_user_id,
    p_deletion_id,
    v_project_fence_id,
    v_now,
    v_now + INTERVAL '15 minutes'
  );

  v_canonical_deletion_id := p_deletion_id;

  RETURN QUERY
  WITH inventory AS (
    SELECT
      'connection'::TEXT AS item_kind,
      connection.id AS item_id
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
    UNION ALL
    SELECT
      'outbox'::TEXT,
      queued.id
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.user_id = p_user_id
  )
  SELECT
    v_canonical_deletion_id,
    inventory.item_kind,
    inventory.item_id
  FROM inventory
  UNION ALL
  SELECT
    v_canonical_deletion_id,
    'none'::TEXT,
    NULL::UUID
  WHERE NOT EXISTS (SELECT 1 FROM inventory)
  ORDER BY 2, 3;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_calendar_account_deletion_v1(
  UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_calendar_account_deletion_v1(
  UUID, TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.begin_calendar_account_deletion_v1(
  UUID, TEXT, UUID
) IS
  'Starts or resumes the canonical account deletion intent after OAuth and provider leases drain, normalizes payload-free pending work, and returns every current connection or retained outbox ciphertext that must be resolved before auth deletion; service role only.';

CREATE FUNCTION private.complete_calendar_account_delete_attempt_v1(
  p_operation_id UUID,
  p_outcome TEXT,
  p_attempted_at TIMESTAMPTZ,
  p_guard_until TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_operation private.calendar_revoke_operations%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF p_operation_id IS NULL
    OR p_outcome NOT IN ('confirmed', 'unconfirmed')
    OR p_attempted_at IS NULL
    OR p_attempted_at > v_now
    OR p_guard_until IS NULL
    OR p_guard_until < p_attempted_at THEN
    RAISE EXCEPTION 'Invalid Calendar account deletion completion'
      USING ERRCODE = '22023';
  END IF;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF NOT FOUND OR v_operation.operation_kind IS DISTINCT FROM 'account_delete' THEN
    RAISE EXCEPTION 'Calendar account deletion operation is unavailable'
      USING ERRCODE = 'CA019';
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_operation.project_fence_id
    AND project.scope_kind = 'project'
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_operation.subject_fence_id
    AND subject.scope_kind IN ('subject', 'quarantine')
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id
  FOR UPDATE;

  IF v_operation.provider_attempt_outcome IS NOT NULL THEN
    RETURN v_operation.state;
  END IF;

  IF v_operation.state IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Calendar account deletion operation is not pending'
      USING ERRCODE = 'CA019';
  END IF;

  UPDATE private.calendar_revoke_operations AS operation
  SET provider_attempt_started_at = p_attempted_at,
      provider_attempt_outcome = p_outcome
  WHERE operation.operation_id = p_operation_id;

  IF p_guard_until > v_now THEN
    UPDATE private.calendar_revoke_operations AS operation
    SET state = CASE
          WHEN p_outcome = 'confirmed' THEN 'revoke_guarded'
          ELSE 'expiry_guarded'
        END,
        active_lease_id = NULL,
        active_lease_expires_at = NULL,
        guard_until = p_guard_until
    WHERE operation.operation_id = p_operation_id;

    RETURN CASE
      WHEN p_outcome = 'confirmed' THEN 'revoke_guarded'
      ELSE 'expiry_guarded'
    END;
  END IF;

  RETURN private.settle_calendar_revoke_operation_v1(
    p_operation_id,
    CASE
      WHEN p_outcome = 'confirmed' THEN 'revoked'
      ELSE 'expired'
    END,
    v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION private.complete_calendar_account_delete_attempt_v1(
  UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.consume_calendar_account_delete_source_v1(
  p_operation_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_operation private.calendar_revoke_operations%ROWTYPE;
  v_source_operation private.calendar_revoke_operations%ROWTYPE;
  v_connection public.calendar_connections%ROWTYPE;
  v_queued private.calendar_revoke_outbox%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF NOT FOUND
    OR v_operation.operation_kind IS DISTINCT FROM 'account_delete' THEN
    RAISE EXCEPTION 'Calendar account deletion operation is unavailable'
      USING ERRCODE = 'CA019';
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_operation.project_fence_id
    AND project.scope_kind = 'project'
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_operation.subject_fence_id
    AND subject.scope_kind IN ('subject', 'quarantine')
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id IN (
    p_operation_id,
    CASE
      WHEN v_operation.account_deletion_item_kind = 'outbox'
        THEN v_operation.account_deletion_item_id
      ELSE p_operation_id
    END
  )
  ORDER BY operation.operation_id
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF v_operation.account_deletion_item_kind = 'connection' THEN
    SELECT connection.*
    INTO v_connection
    FROM public.calendar_connections AS connection
    WHERE connection.id = v_operation.account_deletion_item_id
      AND connection.user_id = v_operation.source_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN 'already_consumed';
    END IF;

    IF v_connection.id IS DISTINCT FROM v_operation.source_connection_id
      OR v_connection.provider IS DISTINCT FROM 'google'
      OR v_connection.authority_fence_id
        IS DISTINCT FROM v_operation.subject_fence_id
      OR v_connection.authority_epoch IS NULL THEN
      RAISE EXCEPTION 'Calendar account deletion connection changed'
        USING ERRCODE = 'CA019';
    END IF;

    DELETE FROM public.external_calendar_events AS event
    WHERE event.user_id = v_operation.source_user_id
      AND event.connection_id = v_connection.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.plans AS plan
        WHERE plan.user_id = v_operation.source_user_id
          AND plan.external_calendar_event_id = event.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.records AS record
        WHERE record.user_id = v_operation.source_user_id
          AND record.external_calendar_event_id = event.id
      );

    DELETE FROM public.calendar_connections AS connection
    WHERE connection.id = v_connection.id
      AND connection.user_id = v_operation.source_user_id;

    RETURN 'consumed';
  END IF;

  SELECT operation.*
  INTO v_source_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = v_operation.account_deletion_item_id;

  SELECT queued.*
  INTO v_queued
  FROM private.calendar_revoke_outbox AS queued
  WHERE queued.id = v_operation.account_deletion_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF v_source_operation.operation_id IS NOT NULL
      AND v_source_operation.operation_id <> v_operation.operation_id
      AND v_source_operation.project_fence_id
        IS NOT DISTINCT FROM v_operation.project_fence_id
      AND v_source_operation.subject_fence_id
        IS NOT DISTINCT FROM v_operation.subject_fence_id
      AND v_source_operation.source_user_id
        IS NOT DISTINCT FROM v_operation.source_user_id
      AND v_source_operation.state IN (
        'revoke_guarded',
        'expiry_guarded',
        'revoked',
        'expired'
      ) THEN
      RETURN 'already_consumed';
    END IF;

    RAISE EXCEPTION 'Calendar account deletion outbox changed'
      USING ERRCODE = 'CA019';
  END IF;

  IF v_source_operation.operation_id IS NULL
    OR v_source_operation.operation_id = v_operation.operation_id
    OR v_source_operation.project_fence_id
      IS DISTINCT FROM v_operation.project_fence_id
    OR v_source_operation.subject_fence_id
      IS DISTINCT FROM v_operation.subject_fence_id
    OR v_source_operation.source_user_id
      IS DISTINCT FROM v_operation.source_user_id
    OR v_queued.user_id IS DISTINCT FROM v_operation.source_user_id
    OR v_queued.source_connection_id
      IS DISTINCT FROM v_operation.source_connection_id
    OR v_queued.authority_fence_id
      IS DISTINCT FROM v_operation.subject_fence_id
    OR v_queued.authority_epoch
      IS DISTINCT FROM v_source_operation.subject_fence_epoch THEN
    RAISE EXCEPTION 'Calendar account deletion outbox changed'
      USING ERRCODE = 'CA019';
  END IF;

  DELETE FROM private.calendar_revoke_outbox AS queued
  WHERE queued.id = v_operation.account_deletion_item_id;

  PERFORM private.settle_calendar_revoke_operation_v1(
    v_source_operation.operation_id,
    'expired',
    v_now
  );

  RETURN 'consumed';
END;
$$;

REVOKE ALL ON FUNCTION private.consume_calendar_account_delete_source_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.consume_calendar_account_delete_source_v1(UUID) IS
  'Atomically removes the Calendar ciphertext covered by a durable account-delete dispatch marker, pruning only unreferenced mirrors and settling any seized outbox operation.';

CREATE FUNCTION private.normalize_calendar_account_deletion_intent_v1(
  p_user_id UUID,
  p_deletion_id UUID,
  p_now TIMESTAMPTZ,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_intent private.calendar_account_deletion_intents%ROWTYPE;
  v_operation private.calendar_revoke_operations%ROWTYPE;
  v_guard_until TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL
    OR p_deletion_id IS NULL
    OR p_now IS NULL
    OR p_now > pg_catalog.clock_timestamp() + INTERVAL '1 second' THEN
    RAISE EXCEPTION 'Invalid Calendar account deletion normalization'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  SELECT intent.*
  INTO v_intent
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = p_user_id
    AND intent.deletion_id = p_deletion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_intent.state = 'ready' THEN
    RETURN 'ready';
  END IF;

  IF NOT p_force AND v_intent.expires_at > p_now THEN
    RETURN 'active';
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_intent.project_fence_id
    AND project.scope_kind = 'project'
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.account_deletion_id = p_deletion_id
      AND operation.operation_kind = 'account_delete'
      AND operation.provider_attempt_started_at IS NOT NULL
      AND operation.provider_attempt_outcome IS NULL
      AND COALESCE(
        operation.active_lease_expires_at,
        operation.provider_attempt_started_at
      ) + INTERVAL '10 minutes' > p_now
  ) THEN
    RETURN 'in_flight';
  END IF;

  FOR v_operation IN
    SELECT operation.*
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.account_deletion_id = p_deletion_id
      AND operation.operation_kind = 'account_delete'
    ORDER BY operation.subject_fence_id, operation.operation_id
  LOOP
    IF v_operation.provider_attempt_outcome IS NOT NULL
      OR v_operation.state IS DISTINCT FROM 'pending' THEN
      CONTINUE;
    END IF;

    IF v_operation.provider_attempt_started_at IS NULL THEN
      PERFORM private.settle_calendar_revoke_operation_v1(
        v_operation.operation_id,
        'expired',
        p_now
      );
      CONTINUE;
    END IF;

    PERFORM private.consume_calendar_account_delete_source_v1(
      v_operation.operation_id
    );

    v_guard_until := GREATEST(
      v_operation.provider_attempt_started_at,
      COALESCE(
        v_operation.active_lease_expires_at,
        v_operation.provider_attempt_started_at
      ) + INTERVAL '10 minutes'
    );

    PERFORM private.complete_calendar_account_delete_attempt_v1(
      v_operation.operation_id,
      'unconfirmed',
      v_operation.provider_attempt_started_at,
      v_guard_until
    );
  END LOOP;

  DELETE FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = p_user_id
    AND intent.deletion_id = p_deletion_id
    AND intent.state = 'preparing';

  RETURN 'normalized';
END;
$$;

REVOKE ALL ON FUNCTION private.normalize_calendar_account_deletion_intent_v1(
  UUID, UUID, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.normalize_calendar_account_deletion_intent_v1(
  UUID, UUID, TIMESTAMPTZ, BOOLEAN
) IS
  'Closes an expired or explicitly cancelled account-delete boundary: dispatched items become unconfirmed without another provider call, never-started wrappers settle, and source data remains only for never-started work.';

CREATE FUNCTION public.prepare_calendar_account_delete_revoke_v1(
  p_deletion_id UUID,
  p_operation_id UUID,
  p_project_key TEXT,
  p_user_id UUID,
  p_item_kind TEXT,
  p_item_id UUID
)
RETURNS TABLE (
  operation_id UUID,
  result TEXT,
  refresh_token_enc TEXT,
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
  v_project_fence_id UUID;
  v_subject_fence_id UUID;
  v_source_connection_id UUID;
  v_connection public.calendar_connections%ROWTYPE;
  v_queued private.calendar_revoke_outbox%ROWTYPE;
  v_source_operation private.calendar_revoke_operations%ROWTYPE;
  v_existing_operation private.calendar_revoke_operations%ROWTYPE;
  v_request_digest BYTEA;
  v_operation_expires_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_deletion_id IS NULL
    OR p_operation_id IS NULL
    OR p_user_id IS NULL
    OR p_item_kind NOT IN ('connection', 'outbox')
    OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar account revoke input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = p_user_id
    AND intent.deletion_id = p_deletion_id
    AND intent.project_fence_id = v_project_fence_id
    AND intent.state = 'preparing'
    AND intent.expires_at > pg_catalog.clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar account deletion intent is unavailable'
      USING ERRCODE = 'CA019';
  END IF;

  SELECT operation.*
  INTO v_existing_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.account_deletion_id = p_deletion_id
    AND operation.account_deletion_item_kind = p_item_kind
    AND operation.account_deletion_item_id = p_item_id
    AND operation.operation_kind = 'account_delete';

  IF FOUND THEN
    v_subject_fence_id := v_existing_operation.subject_fence_id;
    operation_id := v_existing_operation.operation_id;
  ELSIF p_item_kind = 'connection' THEN
    SELECT connection.authority_fence_id
    INTO v_subject_fence_id
    FROM public.calendar_connections AS connection
    WHERE connection.id = p_item_id
      AND connection.user_id = p_user_id;
  ELSE
    SELECT queued.authority_fence_id
    INTO v_subject_fence_id
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id = p_item_id
      AND queued.user_id = p_user_id;
  END IF;

  IF v_subject_fence_id IS NULL THEN
    operation_id := p_operation_id;
    result := 'missing';
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_subject_fence_id
    AND subject.project_key = p_project_key
    AND subject.scope_kind IN ('subject', 'quarantine')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar account deletion subject is unavailable'
      USING ERRCODE = 'CA003';
  END IF;

  PERFORM 1
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id IN (
    v_existing_operation.operation_id,
    CASE
      WHEN p_item_kind = 'outbox' THEN p_item_id
      ELSE v_existing_operation.operation_id
    END
  )
  ORDER BY operation.operation_id
  FOR UPDATE;

  SELECT operation.*
  INTO v_existing_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.account_deletion_id = p_deletion_id
    AND operation.account_deletion_item_kind = p_item_kind
    AND operation.account_deletion_item_id = p_item_id
    AND operation.operation_kind = 'account_delete';

  IF FOUND THEN
    IF v_existing_operation.project_fence_id
        IS DISTINCT FROM v_project_fence_id
      OR v_existing_operation.subject_fence_id
        IS DISTINCT FROM v_subject_fence_id
      OR v_existing_operation.source_user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Calendar account deletion operation was reused'
        USING ERRCODE = 'CA004';
    END IF;

    operation_id := v_existing_operation.operation_id;

    IF v_existing_operation.provider_attempt_outcome IS NOT NULL
      OR v_existing_operation.state IS DISTINCT FROM 'pending' THEN
      result := CASE
        WHEN v_existing_operation.provider_attempt_outcome = 'not_attempted'
          THEN 'not_attempted'
        ELSE v_existing_operation.state
      END;
      refresh_token_enc := NULL;
      lease_id := NULL;
      lease_expires_at := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_existing_operation.provider_attempt_started_at IS NOT NULL THEN
      v_now := pg_catalog.clock_timestamp();

      IF v_existing_operation.active_lease_expires_at + INTERVAL '10 minutes'
        > v_now THEN
        result := 'in_flight';
        RETURN NEXT;
        RETURN;
      END IF;

      result := private.complete_calendar_account_delete_attempt_v1(
        v_existing_operation.operation_id,
        'unconfirmed',
        v_existing_operation.provider_attempt_started_at,
        v_existing_operation.active_lease_expires_at + INTERVAL '10 minutes'
      );
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  IF p_item_kind = 'connection' THEN
    SELECT connection.*
    INTO v_connection
    FROM public.calendar_connections AS connection
    WHERE connection.id = p_item_id
      AND connection.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      result := 'missing';
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_connection.provider IS DISTINCT FROM 'google'
      OR v_connection.authority_fence_id IS DISTINCT FROM v_subject_fence_id
      OR v_connection.authority_epoch IS NULL THEN
      RAISE EXCEPTION 'Calendar account deletion authority invariant failed'
        USING ERRCODE = 'CA003';
    END IF;

    v_source_connection_id := v_connection.id;
    refresh_token_enc := v_connection.refresh_token_enc;
    v_operation_expires_at :=
      pg_catalog.clock_timestamp() + INTERVAL '23 hours 59 minutes';
    v_request_digest := private.digest_calendar_authority_operation_v1(
      'account_delete',
      pg_catalog.jsonb_build_object(
        'deletionId', p_deletion_id,
        'projectKey', p_project_key,
        'userId', p_user_id,
        'itemKind', p_item_kind,
        'itemId', p_item_id,
        'connectionId', v_connection.id,
        'provider', v_connection.provider,
        'providerAccountId', v_connection.provider_account_id,
        'dataGeneration', v_connection.data_generation,
        'authorityFenceId', v_connection.authority_fence_id,
        'authorityEpoch', v_connection.authority_epoch,
        'refreshTokenCiphertext', v_connection.refresh_token_enc
      )
    );
  ELSE
    SELECT operation.*
    INTO v_source_operation
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.operation_id = p_item_id
    FOR UPDATE;

    SELECT queued.*
    INTO v_queued
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id = p_item_id
      AND queued.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND OR v_source_operation.operation_id IS NULL THEN
      result := 'missing';
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_queued.provider IS DISTINCT FROM 'google'
      OR v_queued.authority_fence_id IS DISTINCT FROM v_subject_fence_id
      OR v_queued.authority_epoch IS NULL
      OR v_source_operation.project_fence_id
        IS DISTINCT FROM v_project_fence_id
      OR v_source_operation.subject_fence_id
        IS DISTINCT FROM v_subject_fence_id
      OR v_source_operation.source_user_id IS DISTINCT FROM p_user_id
      OR v_source_operation.source_connection_id
        IS DISTINCT FROM v_queued.source_connection_id
      OR v_source_operation.subject_fence_epoch
        IS DISTINCT FROM v_queued.authority_epoch THEN
      RAISE EXCEPTION 'Calendar account deletion outbox invariant failed'
        USING ERRCODE = 'CA003';
    END IF;

    IF (
        v_queued.lease_id IS NOT NULL
        AND v_queued.lease_expires_at + INTERVAL '10 minutes'
          > pg_catalog.clock_timestamp()
      )
      OR (
        v_source_operation.active_lease_id IS NOT NULL
        AND v_source_operation.active_lease_expires_at + INTERVAL '10 minutes'
          > pg_catalog.clock_timestamp()
      ) THEN
      RAISE EXCEPTION 'Calendar provider revoke is still in flight'
        USING ERRCODE = 'CA019';
    END IF;

    UPDATE private.calendar_revoke_operations AS operation
    SET active_lease_id = NULL,
        active_lease_expires_at = NULL
    WHERE operation.operation_id = v_source_operation.operation_id
      AND operation.state = 'pending';

    UPDATE private.calendar_revoke_outbox AS queued
    SET lease_id = NULL,
        lease_expires_at = NULL
    WHERE queued.id = v_queued.id;

    v_source_connection_id := v_queued.source_connection_id;
    refresh_token_enc := v_queued.refresh_token_enc;
    v_operation_expires_at := CASE
      WHEN v_queued.expires_at
        <= pg_catalog.clock_timestamp() + INTERVAL '30 seconds'
        THEN pg_catalog.clock_timestamp() + INTERVAL '1 minute'
      ELSE LEAST(
        v_queued.expires_at,
        pg_catalog.clock_timestamp() + INTERVAL '23 hours 59 minutes'
      )
    END;
    v_request_digest := private.digest_calendar_authority_operation_v1(
      'account_delete',
      pg_catalog.jsonb_build_object(
        'deletionId', p_deletion_id,
        'projectKey', p_project_key,
        'userId', p_user_id,
        'itemKind', p_item_kind,
        'itemId', p_item_id,
        'connectionId', v_queued.source_connection_id,
        'provider', v_queued.provider,
        'authorityFenceId', v_queued.authority_fence_id,
        'authorityEpoch', v_queued.authority_epoch,
        'refreshTokenCiphertext', v_queued.refresh_token_enc
      )
    );
  END IF;

  IF v_existing_operation.operation_id IS NULL THEN
    PERFORM 1
    FROM private.begin_calendar_revoke_operation_v1(
      p_operation_id,
      v_project_fence_id,
      v_subject_fence_id,
      p_user_id,
      v_source_connection_id,
      'account_delete',
      v_request_digest,
      'marked',
      v_operation_expires_at,
      p_deletion_id,
      p_item_kind,
      p_item_id
    );

    operation_id := p_operation_id;

    SELECT operation.*
    INTO v_existing_operation
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.operation_id = p_operation_id
    FOR UPDATE;
  ELSIF v_existing_operation.request_digest IS DISTINCT FROM v_request_digest
    OR v_existing_operation.source_connection_id
      IS DISTINCT FROM v_source_connection_id THEN
    RAISE EXCEPTION 'Calendar account deletion payload changed'
      USING ERRCODE = 'CA004';
  END IF;

  IF p_item_kind = 'outbox'
    AND v_queued.expires_at
      <= pg_catalog.clock_timestamp() + INTERVAL '30 seconds' THEN
    v_now := pg_catalog.clock_timestamp();

    PERFORM private.consume_calendar_account_delete_source_v1(
      v_existing_operation.operation_id
    );

    PERFORM private.settle_calendar_revoke_operation_v1(
      v_existing_operation.operation_id,
      'expired',
      v_now
    );

    UPDATE private.calendar_revoke_operations AS operation
    SET provider_attempt_outcome = 'not_attempted',
        provider_attempt_reason = 'source_expired'
    WHERE operation.operation_id = v_existing_operation.operation_id;

    INSERT INTO private.integration_security_events (
      user_id,
      event_kind,
      occurred_at
    ) VALUES (
      p_user_id,
      'calendar_revoke_expired',
      v_now
    );

    result := 'not_attempted';
    refresh_token_enc := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_item_kind = 'outbox'
    AND v_source_operation.guard_until IS NOT NULL THEN
    PERFORM private.consume_calendar_account_delete_source_v1(
      v_existing_operation.operation_id
    );

    result := private.complete_calendar_account_delete_attempt_v1(
      v_existing_operation.operation_id,
      'unconfirmed',
      LEAST(v_source_operation.guard_until, pg_catalog.clock_timestamp()),
      v_source_operation.guard_until
    );
    refresh_token_enc := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  v_now := pg_catalog.clock_timestamp();

  IF v_existing_operation.active_lease_id IS NULL
    OR v_existing_operation.active_lease_expires_at <= v_now THEN
    lease_id := gen_random_uuid();
    lease_expires_at := LEAST(
      v_now + INTERVAL '2 minutes',
      v_existing_operation.expires_at
    );

    UPDATE private.calendar_revoke_operations AS operation
    SET active_lease_id = lease_id,
        active_lease_expires_at = lease_expires_at
    WHERE operation.operation_id = v_existing_operation.operation_id;
  ELSE
    lease_id := v_existing_operation.active_lease_id;
    lease_expires_at := v_existing_operation.active_lease_expires_at;
  END IF;

  result := 'prepared';
  attempt_deadline_at := lease_expires_at - INTERVAL '10 seconds';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_calendar_account_delete_revoke_v1(
  UUID, UUID, TEXT, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_calendar_account_delete_revoke_v1(
  UUID, UUID, TEXT, UUID, TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.prepare_calendar_account_delete_revoke_v1(
  UUID, UUID, TEXT, UUID, TEXT, UUID
) IS
  'Fences one account-owned current or retained Google token and returns it under an exact short lease; a previously unconfirmed outbox attempt is adopted without another provider call; service role only.';

CREATE FUNCTION public.start_calendar_account_delete_provider_attempt_v1(
  p_deletion_id UUID,
  p_project_key TEXT,
  p_user_id UUID,
  p_operation_id UUID,
  p_lease_id UUID
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
  v_project_fence_id UUID;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_deletion_id IS NULL
    OR p_user_id IS NULL
    OR p_operation_id IS NULL
    OR p_lease_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar account deletion dispatch'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF NOT FOUND
    OR v_operation.project_fence_id IS DISTINCT FROM v_project_fence_id
    OR v_operation.source_user_id IS DISTINCT FROM p_user_id
    OR v_operation.account_deletion_id IS DISTINCT FROM p_deletion_id
    OR v_operation.operation_kind IS DISTINCT FROM 'account_delete' THEN
    RETURN 'missing';
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_operation.subject_fence_id
    AND subject.project_key = p_project_key
    AND subject.scope_kind IN ('subject', 'quarantine')
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id IN (
    p_operation_id,
    CASE
      WHEN v_operation.account_deletion_item_kind = 'outbox'
        THEN v_operation.account_deletion_item_id
      ELSE p_operation_id
    END
  )
  ORDER BY operation.operation_id
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF v_operation.provider_attempt_outcome IS NOT NULL
    OR v_operation.state IS DISTINCT FROM 'pending' THEN
    RETURN v_operation.state;
  END IF;

  IF v_operation.provider_attempt_started_at IS NOT NULL THEN
    RETURN 'already_started';
  END IF;

  IF v_operation.active_lease_id IS DISTINCT FROM p_lease_id
    OR v_operation.active_lease_expires_at IS NULL
    OR v_operation.active_lease_expires_at <= v_now + INTERVAL '10 seconds' THEN
    RETURN 'superseded';
  END IF;

  PERFORM 1
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = p_user_id
    AND intent.deletion_id = p_deletion_id
    AND intent.project_fence_id = v_project_fence_id
    AND intent.state = 'preparing'
    AND intent.expires_at > v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'superseded';
  END IF;

  UPDATE private.calendar_revoke_operations AS operation
  SET provider_attempt_started_at = v_now
  WHERE operation.operation_id = p_operation_id;

  PERFORM private.consume_calendar_account_delete_source_v1(p_operation_id);

  RETURN 'started';
END;
$$;

REVOKE ALL ON FUNCTION public.start_calendar_account_delete_provider_attempt_v1(
  UUID, TEXT, UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.start_calendar_account_delete_provider_attempt_v1(
    UUID, TEXT, UUID, UUID, UUID
  ) TO service_role;

COMMENT ON FUNCTION public.start_calendar_account_delete_provider_attempt_v1(
  UUID, TEXT, UUID, UUID, UUID
) IS
  'Durably consumes one exact account-deletion dispatch immediately before the provider call; replay never authorizes a second call; service role only.';

CREATE FUNCTION public.finalize_calendar_account_delete_revoke_v1(
  p_deletion_id UUID,
  p_project_key TEXT,
  p_user_id UUID,
  p_operation_id UUID,
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
  v_project_fence_id UUID;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_deletion_id IS NULL
    OR p_user_id IS NULL
    OR p_operation_id IS NULL
    OR p_lease_id IS NULL
    OR p_outcome NOT IN ('confirmed', 'not_started', 'unconfirmed') THEN
    RAISE EXCEPTION 'Invalid Calendar account deletion finalization'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF NOT FOUND
    OR v_operation.project_fence_id IS DISTINCT FROM v_project_fence_id
    OR v_operation.source_user_id IS DISTINCT FROM p_user_id
    OR v_operation.account_deletion_id IS DISTINCT FROM p_deletion_id
    OR v_operation.operation_kind IS DISTINCT FROM 'account_delete' THEN
    RETURN 'missing';
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_operation.subject_fence_id
    AND subject.project_key = p_project_key
    AND subject.scope_kind IN ('subject', 'quarantine')
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id
  FOR UPDATE;

  IF v_operation.provider_attempt_outcome IS NOT NULL THEN
    IF p_outcome IS DISTINCT FROM v_operation.provider_attempt_outcome THEN
      RAISE EXCEPTION 'Calendar account deletion outcome changed on replay'
        USING ERRCODE = 'CA004';
    END IF;

    RETURN v_operation.state;
  END IF;

  IF v_operation.state IS DISTINCT FROM 'pending' THEN
    RETURN v_operation.state;
  END IF;

  IF p_outcome = 'not_started'
    AND v_operation.provider_attempt_started_at IS NULL
    AND v_operation.active_lease_id IS NULL
    AND v_operation.active_lease_expires_at IS NULL THEN
    RETURN 'retried';
  END IF;

  IF v_operation.active_lease_id IS DISTINCT FROM p_lease_id
    OR v_operation.active_lease_expires_at IS NULL THEN
    RETURN 'superseded';
  END IF;

  IF p_outcome = 'not_started' THEN
    IF v_operation.provider_attempt_started_at IS NOT NULL THEN
      RETURN 'attempt_started';
    END IF;

    UPDATE private.calendar_revoke_operations AS operation
    SET active_lease_id = NULL,
        active_lease_expires_at = NULL
    WHERE operation.operation_id = p_operation_id;

    RETURN 'retried';
  END IF;

  IF v_operation.provider_attempt_started_at IS NULL THEN
    RETURN 'not_started';
  END IF;

  IF v_operation.active_lease_expires_at + INTERVAL '10 minutes' <= v_now THEN
    RETURN 'superseded';
  END IF;

  RETURN private.complete_calendar_account_delete_attempt_v1(
    p_operation_id,
    p_outcome,
    v_operation.provider_attempt_started_at,
    CASE
      WHEN p_outcome = 'confirmed' THEN v_now + INTERVAL '10 minutes'
      ELSE GREATEST(
        v_now + INTERVAL '10 minutes',
        v_operation.active_lease_expires_at + INTERVAL '10 minutes'
      )
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_calendar_account_delete_revoke_v1(
  UUID, TEXT, UUID, UUID, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_calendar_account_delete_revoke_v1(
  UUID, TEXT, UUID, UUID, UUID, TEXT
) TO service_role;

COMMENT ON FUNCTION public.finalize_calendar_account_delete_revoke_v1(
  UUID, TEXT, UUID, UUID, UUID, TEXT
) IS
  'Finalizes one durably dispatched account-deletion provider call after its source ciphertext was atomically consumed at dispatch, and never retries it; service role only.';

CREATE FUNCTION public.abandon_calendar_account_delete_revoke_v1(
  p_deletion_id UUID,
  p_project_key TEXT,
  p_user_id UUID,
  p_operation_id UUID,
  p_lease_id UUID,
  p_reason TEXT
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
  v_source_operation private.calendar_revoke_operations%ROWTYPE;
  v_project_fence_id UUID;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_deletion_id IS NULL
    OR p_user_id IS NULL
    OR p_operation_id IS NULL
    OR p_lease_id IS NULL
    OR p_reason NOT IN ('decrypt_failed', 'source_expired') THEN
    RAISE EXCEPTION 'Invalid Calendar account deletion abandonment'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF NOT FOUND
    OR v_operation.project_fence_id IS DISTINCT FROM v_project_fence_id
    OR v_operation.source_user_id IS DISTINCT FROM p_user_id
    OR v_operation.account_deletion_id IS DISTINCT FROM p_deletion_id
    OR v_operation.operation_kind IS DISTINCT FROM 'account_delete' THEN
    RETURN 'missing';
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_operation.subject_fence_id
    AND subject.project_key = p_project_key
    AND subject.scope_kind IN ('subject', 'quarantine')
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id IN (
    p_operation_id,
    CASE
      WHEN v_operation.account_deletion_item_kind = 'outbox'
        THEN v_operation.account_deletion_item_id
      ELSE p_operation_id
    END
  )
  ORDER BY operation.operation_id
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF v_operation.provider_attempt_outcome IS NOT NULL THEN
    IF v_operation.provider_attempt_outcome = 'not_attempted' THEN
      IF v_operation.provider_attempt_reason IS DISTINCT FROM p_reason THEN
        RAISE EXCEPTION 'Calendar account deletion terminal reason changed on replay'
          USING ERRCODE = 'CA004';
      END IF;

      RETURN 'not_attempted';
    END IF;

    RETURN 'attempt_started';
  END IF;

  IF v_operation.state IS DISTINCT FROM 'pending' THEN
    RETURN 'superseded';
  END IF;

  IF v_operation.provider_attempt_started_at IS NOT NULL THEN
    RETURN 'attempt_started';
  END IF;

  IF v_operation.active_lease_id IS DISTINCT FROM p_lease_id
    OR v_operation.active_lease_expires_at IS NULL THEN
    RETURN 'superseded';
  END IF;

  PERFORM 1
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = p_user_id
    AND intent.deletion_id = p_deletion_id
    AND intent.project_fence_id = v_project_fence_id
    AND intent.state = 'preparing'
    AND intent.expires_at > v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'superseded';
  END IF;

  IF p_reason = 'decrypt_failed' THEN
    IF v_operation.active_lease_expires_at <= v_now THEN
      RETURN 'superseded';
    END IF;

    IF v_operation.account_deletion_item_kind = 'connection' THEN
      PERFORM 1
      FROM public.calendar_connections AS connection
      WHERE connection.id = v_operation.account_deletion_item_id
        AND connection.user_id = p_user_id
      FOR UPDATE;
    ELSE
      PERFORM 1
      FROM private.calendar_revoke_outbox AS queued
      WHERE queued.id = v_operation.account_deletion_item_id
        AND queued.user_id = p_user_id
      FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
      RETURN 'source_changed';
    END IF;
  ELSE
    IF v_operation.account_deletion_item_kind IS DISTINCT FROM 'outbox' THEN
      RETURN 'source_changed';
    END IF;

    SELECT operation.*
    INTO v_source_operation
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.operation_id = v_operation.account_deletion_item_id;

    IF v_source_operation.operation_id IS NULL
      OR v_source_operation.project_fence_id
        IS DISTINCT FROM v_operation.project_fence_id
      OR v_source_operation.subject_fence_id
        IS DISTINCT FROM v_operation.subject_fence_id
      OR v_source_operation.source_user_id IS DISTINCT FROM p_user_id
      OR v_operation.active_lease_expires_at > v_now
      OR v_source_operation.expires_at > v_now
      OR v_source_operation.state NOT IN (
        'expiry_guarded',
        'expired'
      )
      OR EXISTS (
        SELECT 1
        FROM private.calendar_revoke_outbox AS queued
        WHERE queued.id = v_operation.account_deletion_item_id
      ) THEN
      RETURN 'source_changed';
    END IF;
  END IF;

  PERFORM private.consume_calendar_account_delete_source_v1(
    p_operation_id
  );

  PERFORM private.settle_calendar_revoke_operation_v1(
    p_operation_id,
    'expired',
    v_now
  );

  UPDATE private.calendar_revoke_operations AS operation
  SET provider_attempt_outcome = 'not_attempted',
      provider_attempt_reason = p_reason
  WHERE operation.operation_id = p_operation_id;

  RETURN 'not_attempted';
END;
$$;

REVOKE ALL ON FUNCTION public.abandon_calendar_account_delete_revoke_v1(
  UUID, TEXT, UUID, UUID, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_calendar_account_delete_revoke_v1(
  UUID, TEXT, UUID, UUID, UUID, TEXT
) TO service_role;

COMMENT ON FUNCTION public.abandon_calendar_account_delete_revoke_v1(
  UUID, TEXT, UUID, UUID, UUID, TEXT
) IS
  'Records an exact account-deletion dispatch as deliberately not attempted only when decryption failed under a live lease or its source ciphertext already hard-expired; consumes any remaining source and never authorizes provider HTTP; service role only.';

CREATE FUNCTION public.seal_calendar_account_deletion_v1(
  p_deletion_id UUID,
  p_project_key TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_project_fence_id UUID;
  v_intent private.calendar_account_deletion_intents%ROWTYPE;
  v_operation_count INTEGER;
  v_receipt_digest BYTEA;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_deletion_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar account deletion seal'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT intent.*
  INTO v_intent
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = p_user_id
    AND intent.deletion_id = p_deletion_id
    AND intent.project_fence_id = v_project_fence_id
    AND (
      intent.state = 'ready'
      OR intent.expires_at > v_now
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_intent.state = 'ready' THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_oauth_attempts AS attempt
    WHERE attempt.user_id = p_user_id
      AND attempt.claimed_at IS NOT NULL
      AND attempt.completed_at IS NULL
      AND attempt.claim_expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Calendar OAuth callback is still active'
      USING ERRCODE = 'CA019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Calendar revoke ciphertext remains for account deletion'
      USING ERRCODE = 'CA019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Calendar connection ciphertext remains for account deletion'
      USING ERRCODE = 'CA019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.account_deletion_id = p_deletion_id
      AND operation.operation_kind = 'account_delete'
      AND NOT (
        (
          operation.provider_attempt_outcome IN (
            'confirmed',
            'unconfirmed'
          )
          AND operation.provider_attempt_started_at IS NOT NULL
          AND operation.provider_attempt_reason IS NULL
          AND operation.state IN (
            'revoke_guarded',
            'expiry_guarded',
            'revoked',
            'expired'
          )
          AND operation.active_lease_id IS NULL
          AND operation.active_lease_expires_at IS NULL
        )
        OR (
          operation.provider_attempt_outcome = 'not_attempted'
          AND operation.provider_attempt_started_at IS NULL
          AND operation.provider_attempt_reason IN (
            'decrypt_failed',
            'source_expired'
          )
          AND operation.state = 'expired'
          AND operation.active_lease_id IS NULL
          AND operation.active_lease_expires_at IS NULL
          AND operation.guard_until IS NULL
          AND operation.settled_at IS NOT NULL
          AND operation.delete_after IS NOT NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'A Calendar provider attempt is incomplete for account deletion'
      USING ERRCODE = 'CA019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.source_user_id = p_user_id
      AND operation.operation_kind <> 'account_delete'
      AND operation.state = 'pending'
  ) THEN
    RAISE EXCEPTION 'Calendar authority work remains pending for account deletion'
      USING ERRCODE = 'CA019';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.sha256(
      pg_catalog.convert_to(
        COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'operationId', operation.operation_id,
              'itemKind', operation.account_deletion_item_kind,
              'itemId', operation.account_deletion_item_id,
              'attemptStartedAt', operation.provider_attempt_started_at,
              'outcome', operation.provider_attempt_outcome,
              'reason', operation.provider_attempt_reason
            )
            ORDER BY operation.operation_id
          )::TEXT,
          '[]'
        ),
        'UTF8'
      )
    )
  INTO v_operation_count, v_receipt_digest
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.account_deletion_id = p_deletion_id
    AND operation.operation_kind = 'account_delete';

  UPDATE private.calendar_account_deletion_intents AS intent
  SET state = 'ready',
      ready_at = COALESCE(intent.ready_at, v_now),
      sealed_operation_count = v_operation_count,
      sealed_receipt_digest = v_receipt_digest
  WHERE intent.user_id = p_user_id
    AND intent.deletion_id = p_deletion_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.seal_calendar_account_deletion_v1(
  UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seal_calendar_account_deletion_v1(
  UUID, TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.seal_calendar_account_deletion_v1(
  UUID, TEXT, UUID
) IS
  'Seals account deletion only after every current or retained Calendar ciphertext has a strict durable confirmed, unconfirmed, or explicit not-attempted receipt and no pending payload remains; service role only.';

CREATE FUNCTION public.cancel_calendar_account_deletion_v1(
  p_deletion_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_normalize_result TEXT;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_deletion_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar account deletion cancellation'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.account_deletion_id = p_deletion_id
      AND operation.operation_kind = 'account_delete'
      AND (
        operation.provider_attempt_started_at IS NOT NULL
        OR operation.provider_attempt_outcome IS NOT NULL
      )
  ) THEN
    RETURN FALSE;
  END IF;

  v_normalize_result :=
    private.normalize_calendar_account_deletion_intent_v1(
      p_user_id,
      p_deletion_id,
      pg_catalog.clock_timestamp(),
      TRUE
    );

  RETURN v_normalize_result = 'normalized';
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_calendar_account_deletion_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_calendar_account_deletion_v1(UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.cancel_calendar_account_deletion_v1(UUID, UUID) IS
  'Clears only an untouched preparing account deletion intent; a dispatched or sealed deletion remains resumable and cannot reopen writers; service role only.';

CREATE FUNCTION public.list_expired_calendar_account_deletion_intents_v1(
  p_project_key TEXT,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
  user_id UUID,
  deletion_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_project_fence_id UUID;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Calendar account deletion listing limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  RETURN QUERY
  SELECT intent.user_id, intent.deletion_id
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.project_fence_id = v_project_fence_id
    AND intent.state = 'preparing'
    AND intent.expires_at <= v_now
  ORDER BY intent.expires_at, intent.user_id
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_expired_calendar_account_deletion_intents_v1(
  TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.list_expired_calendar_account_deletion_intents_v1(TEXT, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.list_expired_calendar_account_deletion_intents_v1(
  TEXT, INTEGER
) IS
  'Lists expired account-deletion intents for a dispatcher; each returned user must be normalized by a separate RPC transaction because the writer lock is transaction-bound; service role only.';

CREATE FUNCTION public.normalize_calendar_account_deletion_intent_v1(
  p_project_key TEXT,
  p_user_id UUID,
  p_deletion_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_project_fence_id UUID;
  v_intent_project_fence_id UUID;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL OR p_deletion_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar account deletion normalization input'
      USING ERRCODE = '22023';
  END IF;

  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  SELECT intent.project_fence_id
  INTO v_intent_project_fence_id
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = p_user_id
    AND intent.deletion_id = p_deletion_id;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_intent_project_fence_id IS DISTINCT FROM v_project_fence_id THEN
    RAISE EXCEPTION 'Calendar account deletion project changed'
      USING ERRCODE = 'CA004';
  END IF;

  RETURN private.normalize_calendar_account_deletion_intent_v1(
    p_user_id,
    p_deletion_id,
    pg_catalog.clock_timestamp(),
    FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_calendar_account_deletion_intent_v1(
  TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_calendar_account_deletion_intent_v1(
  TEXT, UUID, UUID
) TO service_role;

COMMENT ON FUNCTION public.normalize_calendar_account_deletion_intent_v1(
  TEXT, UUID, UUID
) IS
  'Normalizes one exact expired account-deletion intent in its own user-bound transaction without authorizing another provider call; service role only.';

CREATE FUNCTION private.expire_calendar_revoke_ciphertexts_internal_v1(
  p_project_fence_id UUID,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
  ciphertexts_deleted INTEGER,
  ciphertexts_deferred INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '100ms'
SET statement_timeout = '60s'
AS $$
DECLARE
  v_candidate RECORD;
  v_sqlstate TEXT;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF p_project_fence_id IS NULL
    OR p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Calendar ciphertext expiry input is invalid'
      USING ERRCODE = '22023';
  END IF;

  ciphertexts_deleted := 0;
  ciphertexts_deferred := 0;

  FOR v_candidate IN
    SELECT operation.operation_id
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.project_fence_id = p_project_fence_id
      AND operation.state = 'pending'
      AND operation.expires_at <= v_now
      AND operation.operation_kind <> 'account_delete'
    ORDER BY operation.expires_at, operation.operation_id
    LIMIT p_limit
  LOOP
    BEGIN
      ciphertexts_deleted := ciphertexts_deleted
        + private.expire_calendar_revoke_operation_item_v1(
            v_candidate.operation_id,
            v_now
          );
    EXCEPTION
      WHEN query_canceled THEN
        ciphertexts_deferred := ciphertexts_deferred + 1;
        EXIT;
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
        ciphertexts_deferred := ciphertexts_deferred + 1;
        RAISE WARNING
          'Calendar ciphertext expiry candidate deferred (sqlstate=%)',
          v_sqlstate;
    END;
  END LOOP;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.expire_calendar_revoke_ciphertexts_internal_v1(
  UUID, INTEGER
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.expire_calendar_revoke_ciphertexts_internal_v1(
  UUID, INTEGER
) IS
  'Expires each due ciphertext in an isolated subtransaction so one contended or corrupt candidate cannot roll back the rest; reports only aggregate failures and payload-free SQLSTATE warnings; owner-only.';

CREATE FUNCTION public.expire_calendar_revoke_authority_v3(
  p_project_key TEXT,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
  ciphertexts_deleted INTEGER,
  ciphertexts_deferred INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
DECLARE
  v_project_fence_id UUID;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  RETURN QUERY
  SELECT
    result.ciphertexts_deleted,
    result.ciphertexts_deferred
  FROM private.expire_calendar_revoke_ciphertexts_internal_v1(
    v_project_fence_id,
    p_limit
  ) AS result;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_calendar_revoke_authority_v3(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_calendar_revoke_authority_v3(
  TEXT, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.expire_calendar_revoke_authority_v3(TEXT, INTEGER) IS
  'Enforces project-scoped Calendar ciphertext hard expiry in a standalone transaction; guard finalization and per-user account-intent normalization use separate RPC transactions; service role only.';

CREATE FUNCTION public.finalize_calendar_revoke_guards_v1(
  p_project_key TEXT,
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.resolve_calendar_authority_project_fence_v1(p_project_key);

  RETURN private.finalize_calendar_revoke_guards_internal_v1(p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_calendar_revoke_guards_v1(
  TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_calendar_revoke_guards_v1(
  TEXT, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.finalize_calendar_revoke_guards_v1(TEXT, INTEGER) IS
  'Finalizes elapsed provider-uncertainty guards in a transaction separate from mandatory ciphertext hard expiry; service role only.';

CREATE FUNCTION private.enforce_calendar_account_delete_boundary_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_intent private.calendar_account_deletion_intents%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM private.calendar_authority_projects AS project
    WHERE project.singleton
      AND project.activation_version = 1
      AND project.activated_at IS NOT NULL
  ) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_oauth_attempts AS attempt
    WHERE attempt.user_id = OLD.id
      AND attempt.claimed_at IS NOT NULL
      AND attempt.completed_at IS NULL
      AND attempt.claim_expires_at > v_now
  ) THEN
    RAISE EXCEPTION 'Account deletion cannot overtake a Calendar OAuth callback'
      USING ERRCODE = 'CA019';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM public.calendar_connections AS connection
      WHERE connection.user_id = OLD.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM private.calendar_revoke_outbox AS queued
      WHERE queued.user_id = OLD.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM private.calendar_revoke_operations AS operation
      WHERE operation.source_user_id = OLD.id
        AND (
          operation.operation_kind = 'account_delete'
          OR operation.state = 'pending'
        )
    ) THEN
    RETURN OLD;
  END IF;

  SELECT intent.*
  INTO v_intent
  FROM private.calendar_account_deletion_intents AS intent
  WHERE intent.user_id = OLD.id
    AND intent.state = 'ready'
    AND intent.ready_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar provider revocation was not prepared for account deletion'
      USING ERRCODE = 'CA019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.user_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Calendar revoke ciphertext remains at account deletion'
      USING ERRCODE = 'CA019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = OLD.id
      AND NOT EXISTS (
        SELECT 1
        FROM private.calendar_revoke_operations AS operation
        WHERE operation.account_deletion_id = v_intent.deletion_id
          AND operation.source_user_id = OLD.id
          AND operation.account_deletion_item_kind = 'connection'
          AND operation.account_deletion_item_id = connection.id
          AND operation.operation_kind = 'account_delete'
          AND (
            (
              operation.provider_attempt_started_at IS NOT NULL
              AND operation.provider_attempt_outcome IN (
                'confirmed',
                'unconfirmed'
              )
              AND operation.provider_attempt_reason IS NULL
            )
            OR (
              operation.provider_attempt_started_at IS NULL
              AND operation.provider_attempt_outcome = 'not_attempted'
              AND operation.provider_attempt_reason = 'decrypt_failed'
            )
          )
          AND operation.state IN (
            'revoke_guarded',
            'expiry_guarded',
            'revoked',
            'expired'
          )
          AND operation.active_lease_id IS NULL
          AND operation.active_lease_expires_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Calendar provider revocation is incomplete for account deletion'
      USING ERRCODE = 'CA019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.account_deletion_id = v_intent.deletion_id
      AND operation.operation_kind = 'account_delete'
      AND NOT (
        (
          operation.provider_attempt_outcome IN (
            'confirmed',
            'unconfirmed'
          )
          AND operation.provider_attempt_started_at IS NOT NULL
          AND operation.provider_attempt_reason IS NULL
          AND operation.state IN (
            'revoke_guarded',
            'expiry_guarded',
            'revoked',
            'expired'
          )
          AND operation.active_lease_id IS NULL
          AND operation.active_lease_expires_at IS NULL
        )
        OR (
          operation.provider_attempt_outcome = 'not_attempted'
          AND operation.provider_attempt_started_at IS NULL
          AND operation.provider_attempt_reason IN (
            'decrypt_failed',
            'source_expired'
          )
          AND operation.state = 'expired'
          AND operation.active_lease_id IS NULL
          AND operation.active_lease_expires_at IS NULL
          AND operation.guard_until IS NULL
          AND operation.settled_at IS NOT NULL
          AND operation.delete_after IS NOT NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'Calendar account deletion attempt receipt is incomplete'
      USING ERRCODE = 'CA019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.source_user_id = OLD.id
      AND operation.operation_kind <> 'account_delete'
      AND operation.state = 'pending'
  ) THEN
    RAISE EXCEPTION 'Calendar authority work remains pending at account deletion'
      USING ERRCODE = 'CA019';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_calendar_account_delete_boundary_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_calendar_account_delete_boundary
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_calendar_account_delete_boundary_v1();

COMMIT;
