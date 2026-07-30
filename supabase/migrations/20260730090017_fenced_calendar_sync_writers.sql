-- Draft: replace every service-role Calendar sync, selection, cursor, status,
-- and mirror mutation with generation/authority/DB-sequence fenced commands.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION private.lock_calendar_sync_writer_v1(
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_authority_fence_id UUID,
  p_expected_authority_epoch BIGINT,
  p_expected_sync_sequence BIGINT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_current_generation BIGINT;
  v_project_fence_id UUID;
  v_quarantine_state TEXT;
  v_subject_epoch BIGINT;
  v_subject_state TEXT;
  v_connection RECORD;
BEGIN
  IF p_user_id IS NULL
    OR p_connection_id IS NULL
    OR p_expected_generation IS NULL
    OR p_expected_generation < 0
    OR p_expected_authority_fence_id IS NULL
    OR p_expected_authority_epoch IS NULL
    OR p_expected_authority_epoch < 0
    OR (
      p_expected_sync_sequence IS NOT NULL
      AND p_expected_sync_sequence < 1
    ) THEN
    RAISE EXCEPTION 'Invalid Calendar sync writer identity'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_calendar_account_not_deleting_v1(p_user_id);
  v_current_generation := private.get_user_data_generation_v1(p_user_id);
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT quarantine.state
  INTO v_quarantine_state
  FROM private.calendar_authority_fences AS quarantine
  WHERE quarantine.project_key = p_project_key
    AND quarantine.scope_kind = 'quarantine'
  FOR UPDATE;

  SELECT
    subject.epoch,
    subject.state
  INTO
    v_subject_epoch,
    v_subject_state
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = p_expected_authority_fence_id
    AND subject.project_key = p_project_key
    AND subject.scope_kind = 'subject'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'superseded';
  END IF;

  SELECT
    connection.provider,
    connection.status,
    connection.data_generation,
    connection.authority_fence_id,
    connection.authority_epoch,
    connection.sync_sequence
  INTO v_connection
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_current_generation IS DISTINCT FROM p_expected_generation
    OR v_connection.provider IS DISTINCT FROM 'google'
    OR v_connection.status IS DISTINCT FROM 'active'
    OR v_connection.data_generation IS DISTINCT FROM p_expected_generation
    OR v_connection.authority_fence_id
      IS DISTINCT FROM p_expected_authority_fence_id
    OR v_connection.authority_epoch
      IS DISTINCT FROM p_expected_authority_epoch
    OR v_subject_epoch IS DISTINCT FROM p_expected_authority_epoch
    OR v_subject_state IS DISTINCT FROM 'ready'
    OR v_quarantine_state IS DISTINCT FROM 'ready'
    OR (
      p_expected_sync_sequence IS NOT NULL
      AND v_connection.sync_sequence
        IS DISTINCT FROM p_expected_sync_sequence
    ) THEN
    RETURN 'superseded';
  END IF;

  RETURN 'current';
END;
$$;

REVOKE ALL ON FUNCTION private.lock_calendar_sync_writer_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.begin_calendar_sync_run_v1(
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID
)
RETURNS TABLE (
  result TEXT,
  data_generation BIGINT,
  authority_fence_id UUID,
  authority_epoch BIGINT,
  sync_sequence BIGINT,
  run_started_at TIMESTAMPTZ,
  refresh_token_enc TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_current_generation BIGINT;
  v_project_fence_id UUID;
  v_subject_fence_id UUID;
  v_subject_epoch BIGINT;
  v_subject_state TEXT;
  v_quarantine_state TEXT;
  v_connection RECORD;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar sync run input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_calendar_account_not_deleting_v1(p_user_id);
  v_current_generation := private.get_user_data_generation_v1(p_user_id);
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT quarantine.state
  INTO v_quarantine_state
  FROM private.calendar_authority_fences AS quarantine
  WHERE quarantine.project_key = p_project_key
    AND quarantine.scope_kind = 'quarantine'
  FOR UPDATE;

  SELECT connection.authority_fence_id
  INTO v_subject_fence_id
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  IF NOT FOUND OR v_subject_fence_id IS NULL THEN
    result := 'missing';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT
    subject.epoch,
    subject.state
  INTO
    v_subject_epoch,
    v_subject_state
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_subject_fence_id
    AND subject.project_key = p_project_key
    AND subject.scope_kind = 'subject'
  FOR UPDATE;

  IF NOT FOUND THEN
    result := 'superseded';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT
    connection.provider,
    connection.status,
    connection.data_generation,
    connection.authority_fence_id,
    connection.authority_epoch,
    connection.sync_sequence,
    connection.refresh_token_enc
  INTO v_connection
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    result := 'missing';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_current_generation IS DISTINCT FROM v_connection.data_generation
    OR v_connection.provider IS DISTINCT FROM 'google'
    OR v_connection.status IS DISTINCT FROM 'active'
    OR v_connection.authority_fence_id IS DISTINCT FROM v_subject_fence_id
    OR v_connection.authority_epoch IS DISTINCT FROM v_subject_epoch
    OR v_subject_state IS DISTINCT FROM 'ready'
    OR v_quarantine_state IS DISTINCT FROM 'ready' THEN
    result := CASE
      WHEN v_connection.status = 'reauth_required' THEN 'reauth_required'
      ELSE 'superseded'
    END;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_connection.sync_sequence = 9223372036854775807::BIGINT THEN
    RAISE EXCEPTION 'Calendar sync sequence exhausted'
      USING ERRCODE = '54000';
  END IF;

  run_started_at := pg_catalog.clock_timestamp();

  UPDATE public.calendar_connections AS connection
  SET sync_sequence = connection.sync_sequence + 1
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id
  RETURNING
    connection.data_generation,
    connection.authority_fence_id,
    connection.authority_epoch,
    connection.sync_sequence,
    connection.refresh_token_enc
  INTO
    data_generation,
    authority_fence_id,
    authority_epoch,
    sync_sequence,
    refresh_token_enc;

  result := 'started';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_calendar_sync_run_v1(
  TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_calendar_sync_run_v1(
  TEXT, UUID, UUID
) TO service_role;

COMMENT ON FUNCTION public.begin_calendar_sync_run_v1(TEXT, UUID, UUID) IS
  'Issues the next DB-monotonic sync publication sequence and database run timestamp only while user generation and Google subject/quarantine authority are current; returns the encrypted token to service role only.';

CREATE FUNCTION public.clear_calendar_sync_cursor_command_v1(
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_authority_fence_id UUID,
  p_expected_authority_epoch BIGINT,
  p_expected_sync_sequence BIGINT,
  p_calendar_selection_id UUID,
  p_provider_calendar_id TEXT,
  p_expected_sync_token TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_writer_state TEXT;
  v_current_token TEXT;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_calendar_selection_id IS NULL
    OR NULLIF(pg_catalog.btrim(p_provider_calendar_id), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar cursor reset input'
      USING ERRCODE = '22023';
  END IF;

  v_writer_state := private.lock_calendar_sync_writer_v1(
    p_project_key,
    p_user_id,
    p_connection_id,
    p_expected_generation,
    p_expected_authority_fence_id,
    p_expected_authority_epoch,
    p_expected_sync_sequence
  );

  IF v_writer_state IS DISTINCT FROM 'current' THEN
    RETURN v_writer_state;
  END IF;

  SELECT calendar.sync_token
  INTO v_current_token
  FROM public.calendar_connection_calendars AS calendar
  WHERE calendar.id = p_calendar_selection_id
    AND calendar.user_id = p_user_id
    AND calendar.connection_id = p_connection_id
    AND calendar.provider_calendar_id = p_provider_calendar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing_selection';
  END IF;

  IF v_current_token IS DISTINCT FROM p_expected_sync_token THEN
    RETURN 'superseded';
  END IF;

  UPDATE public.calendar_connection_calendars AS calendar
  SET sync_token = NULL
  WHERE calendar.id = p_calendar_selection_id;

  RETURN 'cleared';
END;
$$;

REVOKE ALL ON FUNCTION public.clear_calendar_sync_cursor_command_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_calendar_sync_cursor_command_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, UUID, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.clear_calendar_sync_cursor_command_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, UUID, TEXT, TEXT
) IS
  'Clears one exact selected-calendar cursor only for the latest DB-issued sync run and the cursor value observed before the provider call; service role only.';

CREATE FUNCTION public.persist_calendar_sync_result_command_v1(
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_authority_fence_id UUID,
  p_expected_authority_epoch BIGINT,
  p_expected_sync_sequence BIGINT,
  p_calendar_selection_id UUID,
  p_provider_calendar_id TEXT,
  p_run_started_at TIMESTAMPTZ,
  p_events JSONB,
  p_tombstone_event_ids TEXT[],
  p_used_full_sync BOOLEAN,
  p_next_cursor TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_writer_state TEXT;
  v_calendar RECORD;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_calendar_selection_id IS NULL
    OR NULLIF(pg_catalog.btrim(p_provider_calendar_id), '') IS NULL
    OR p_run_started_at IS NULL
    OR p_run_started_at > v_now + INTERVAL '1 minute'
    OR p_events IS NULL
    OR pg_catalog.jsonb_typeof(p_events) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_events) > 10000
    OR p_tombstone_event_ids IS NULL
    OR pg_catalog.cardinality(p_tombstone_event_ids) > 10000
    OR pg_catalog.array_position(p_tombstone_event_ids, NULL::TEXT) IS NOT NULL
    OR p_used_full_sync IS NULL
    OR (
      p_next_cursor IS NOT NULL
      AND NULLIF(pg_catalog.btrim(p_next_cursor), '') IS NULL
    ) THEN
    RAISE EXCEPTION 'Invalid Calendar sync result input'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
      SELECT 1
      FROM pg_catalog.unnest(p_tombstone_event_ids) AS tombstone(provider_event_id)
      WHERE NULLIF(pg_catalog.btrim(tombstone.provider_event_id), '') IS NULL
    )
    OR (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.unnest(p_tombstone_event_ids) AS tombstone(provider_event_id)
    ) IS DISTINCT FROM (
      SELECT pg_catalog.count(DISTINCT tombstone.provider_event_id)
      FROM pg_catalog.unnest(p_tombstone_event_ids) AS tombstone(provider_event_id)
    ) THEN
    RAISE EXCEPTION 'Invalid Calendar tombstone identity'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_events) AS item(value)
      WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'object'
        OR pg_catalog.jsonb_typeof(item.value -> 'providerEventId')
          IS DISTINCT FROM 'string'
        OR NULLIF(
          pg_catalog.btrim(item.value ->> 'providerEventId'),
          ''
        ) IS NULL
        OR pg_catalog.length(item.value ->> 'providerEventId') > 2048
        OR pg_catalog.jsonb_typeof(item.value -> 'title')
          IS DISTINCT FROM 'string'
        OR (
          item.value -> 'description' IS NOT NULL
          AND pg_catalog.jsonb_typeof(item.value -> 'description')
            NOT IN ('null', 'string')
        )
        OR pg_catalog.jsonb_typeof(item.value -> 'startAt')
          IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(item.value -> 'endAt')
          IS DISTINCT FROM 'string'
    )
    OR (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_array_elements(p_events) AS item(value)
    ) IS DISTINCT FROM (
      SELECT pg_catalog.count(DISTINCT item.value ->> 'providerEventId')
      FROM pg_catalog.jsonb_array_elements(p_events) AS item(value)
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_events) AS item(value)
      WHERE item.value ->> 'providerEventId' = ANY(p_tombstone_event_ids)
    ) THEN
    RAISE EXCEPTION 'Invalid Calendar event payload'
      USING ERRCODE = '22023';
  END IF;

  v_writer_state := private.lock_calendar_sync_writer_v1(
    p_project_key,
    p_user_id,
    p_connection_id,
    p_expected_generation,
    p_expected_authority_fence_id,
    p_expected_authority_epoch,
    p_expected_sync_sequence
  );

  IF v_writer_state IS DISTINCT FROM 'current' THEN
    RETURN v_writer_state;
  END IF;

  SELECT
    calendar.calendar_name,
    calendar.last_synced_at
  INTO v_calendar
  FROM public.calendar_connection_calendars AS calendar
  WHERE calendar.id = p_calendar_selection_id
    AND calendar.user_id = p_user_id
    AND calendar.connection_id = p_connection_id
    AND calendar.provider_calendar_id = p_provider_calendar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing_selection';
  END IF;

  IF v_calendar.last_synced_at > p_run_started_at THEN
    RETURN 'superseded';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_events) AS item(value)
    WHERE (item.value ->> 'endAt')::TIMESTAMPTZ
      <= (item.value ->> 'startAt')::TIMESTAMPTZ
  ) THEN
    RAISE EXCEPTION 'Invalid Calendar event time range'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.external_calendar_events (
    user_id,
    provider,
    connection_id,
    provider_calendar_id,
    provider_event_id,
    title,
    description,
    calendar_name,
    start_at,
    end_at,
    status,
    last_synced_at
  )
  SELECT
    p_user_id,
    'google',
    p_connection_id,
    p_provider_calendar_id,
    item.value ->> 'providerEventId',
    item.value ->> 'title',
    CASE
      WHEN pg_catalog.jsonb_typeof(item.value -> 'description') = 'string'
        THEN item.value ->> 'description'
      ELSE NULL
    END,
    v_calendar.calendar_name,
    (item.value ->> 'startAt')::TIMESTAMPTZ,
    (item.value ->> 'endAt')::TIMESTAMPTZ,
    'confirmed',
    p_run_started_at
  FROM pg_catalog.jsonb_array_elements(p_events) AS item(value)
  ON CONFLICT (
    user_id,
    provider,
    connection_id,
    provider_calendar_id,
    provider_event_id
  ) DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      calendar_name = EXCLUDED.calendar_name,
      start_at = EXCLUDED.start_at,
      end_at = EXCLUDED.end_at,
      status = 'confirmed',
      last_synced_at = EXCLUDED.last_synced_at
  WHERE external_calendar_events.last_synced_at <= EXCLUDED.last_synced_at;

  UPDATE public.external_calendar_events AS event
  SET status = 'cancelled',
      last_synced_at = p_run_started_at
  WHERE event.user_id = p_user_id
    AND event.connection_id = p_connection_id
    AND event.provider_calendar_id = p_provider_calendar_id
    AND event.provider_event_id = ANY(p_tombstone_event_ids)
    AND event.last_synced_at <= p_run_started_at;

  IF p_used_full_sync AND p_next_cursor IS NOT NULL THEN
    UPDATE public.external_calendar_events AS event
    SET status = 'cancelled',
        last_synced_at = p_run_started_at
    WHERE event.user_id = p_user_id
      AND event.connection_id = p_connection_id
      AND event.provider_calendar_id = p_provider_calendar_id
      AND event.last_synced_at < p_run_started_at
      AND event.status <> 'cancelled';
  END IF;

  UPDATE public.calendar_connection_calendars AS calendar
  SET sync_token = CASE
        WHEN p_next_cursor IS NULL THEN calendar.sync_token
        ELSE p_next_cursor
      END,
      last_synced_at = p_run_started_at
  WHERE calendar.id = p_calendar_selection_id;

  RETURN 'persisted';
END;
$$;

REVOKE ALL ON FUNCTION public.persist_calendar_sync_result_command_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, UUID, TEXT,
  TIMESTAMPTZ, JSONB, TEXT[], BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_calendar_sync_result_command_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, UUID, TEXT,
  TIMESTAMPTZ, JSONB, TEXT[], BOOLEAN, TEXT
) TO service_role;

COMMENT ON FUNCTION public.persist_calendar_sync_result_command_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, UUID, TEXT,
  TIMESTAMPTZ, JSONB, TEXT[], BOOLEAN, TEXT
) IS
  'Atomically persists one selected-calendar result only for the latest DB-issued run, preserving dismissed state and preventing stale inserts, tombstones, sweeps, or cursors; service role only.';

CREATE FUNCTION public.finish_calendar_sync_run_v1(
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_authority_fence_id UUID,
  p_expected_authority_epoch BIGINT,
  p_expected_sync_sequence BIGINT,
  p_run_started_at TIMESTAMPTZ,
  p_last_sync_error TEXT,
  p_prune_window BOOLEAN,
  p_not_before TIMESTAMPTZ,
  p_not_after TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_writer_state TEXT;
  v_connection_last_synced_at TIMESTAMPTZ;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_run_started_at IS NULL
    OR p_run_started_at > v_now + INTERVAL '1 minute'
    OR p_last_sync_error NOT IN (
      'encryption_key_invalid',
      'partial_failure',
      'provider_unavailable',
      'rate_limited',
      'reauth_required'
    )
      AND p_last_sync_error IS NOT NULL
    OR p_prune_window IS NULL
    OR (
      p_prune_window
      AND (
        p_not_before IS NULL
        OR p_not_after IS NULL
        OR p_not_after <= p_not_before
      )
    )
    OR (
      NOT p_prune_window
      AND (p_not_before IS NOT NULL OR p_not_after IS NOT NULL)
    ) THEN
    RAISE EXCEPTION 'Invalid Calendar sync completion input'
      USING ERRCODE = '22023';
  END IF;

  v_writer_state := private.lock_calendar_sync_writer_v1(
    p_project_key,
    p_user_id,
    p_connection_id,
    p_expected_generation,
    p_expected_authority_fence_id,
    p_expected_authority_epoch,
    p_expected_sync_sequence
  );

  IF v_writer_state IS DISTINCT FROM 'current' THEN
    RETURN v_writer_state;
  END IF;

  SELECT connection.last_synced_at
  INTO v_connection_last_synced_at
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  IF v_connection_last_synced_at > p_run_started_at THEN
    RETURN 'superseded';
  END IF;

  IF p_prune_window THEN
    DELETE FROM public.external_calendar_events AS event
    WHERE event.user_id = p_user_id
      AND event.connection_id = p_connection_id
      AND event.last_synced_at <= p_run_started_at
      AND (
        event.end_at < p_not_before
        OR event.start_at > p_not_after
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.plans AS plan
        WHERE plan.user_id = p_user_id
          AND plan.external_calendar_event_id = event.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.records AS record
        WHERE record.user_id = p_user_id
          AND record.external_calendar_event_id = event.id
      );
  END IF;

  UPDATE public.calendar_connections AS connection
  SET last_sync_error = p_last_sync_error,
      last_synced_at = p_run_started_at
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  RETURN 'finished';
END;
$$;

REVOKE ALL ON FUNCTION public.finish_calendar_sync_run_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, TIMESTAMPTZ,
  TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_calendar_sync_run_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, TIMESTAMPTZ,
  TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.finish_calendar_sync_run_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, TIMESTAMPTZ,
  TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ
) IS
  'Publishes connection status and optional anti-join window pruning only if no newer DB-issued sync run, purge, reconnect, selection change, or revoke superseded it; service role only.';

CREATE FUNCTION public.replace_selected_calendars_command_v1(
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_authority_fence_id UUID,
  p_expected_authority_epoch BIGINT,
  p_selected_calendars JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_writer_state TEXT;
  v_removed_ids TEXT[];
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_selected_calendars IS NULL
    OR pg_catalog.jsonb_typeof(p_selected_calendars) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_selected_calendars) > 250
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_selected_calendars) AS item(value)
      WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'object'
        OR pg_catalog.jsonb_typeof(item.value -> 'providerCalendarId')
          IS DISTINCT FROM 'string'
        OR NULLIF(
          pg_catalog.btrim(item.value ->> 'providerCalendarId'),
          ''
        ) IS NULL
        OR pg_catalog.length(item.value ->> 'providerCalendarId') > 2048
        OR (
          item.value -> 'calendarName' IS NOT NULL
          AND pg_catalog.jsonb_typeof(item.value -> 'calendarName')
            NOT IN ('null', 'string')
        )
    )
    OR (
      SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_array_elements(p_selected_calendars) AS item(value)
    ) IS DISTINCT FROM (
      SELECT pg_catalog.count(DISTINCT item.value ->> 'providerCalendarId')
      FROM pg_catalog.jsonb_array_elements(p_selected_calendars) AS item(value)
    ) THEN
    RAISE EXCEPTION 'Invalid selected Calendar payload'
      USING ERRCODE = '22023';
  END IF;

  v_writer_state := private.lock_calendar_sync_writer_v1(
    p_project_key,
    p_user_id,
    p_connection_id,
    p_expected_generation,
    p_expected_authority_fence_id,
    p_expected_authority_epoch,
    NULL
  );

  IF v_writer_state IS DISTINCT FROM 'current' THEN
    RETURN v_writer_state;
  END IF;

  INSERT INTO public.calendar_connection_calendars (
    user_id,
    connection_id,
    provider_calendar_id,
    calendar_name
  )
  SELECT
    p_user_id,
    p_connection_id,
    item.value ->> 'providerCalendarId',
    CASE
      WHEN pg_catalog.jsonb_typeof(item.value -> 'calendarName') = 'string'
        THEN item.value ->> 'calendarName'
      ELSE NULL
    END
  FROM pg_catalog.jsonb_array_elements(p_selected_calendars) AS item(value)
  ON CONFLICT (connection_id, provider_calendar_id) DO UPDATE
  SET calendar_name = EXCLUDED.calendar_name;

  WITH removed AS (
    DELETE FROM public.calendar_connection_calendars AS calendar
    WHERE calendar.user_id = p_user_id
      AND calendar.connection_id = p_connection_id
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements(p_selected_calendars) AS item(value)
        WHERE item.value ->> 'providerCalendarId'
          = calendar.provider_calendar_id
      )
    RETURNING calendar.provider_calendar_id
  )
  SELECT COALESCE(
    pg_catalog.array_agg(removed.provider_calendar_id),
    ARRAY[]::TEXT[]
  )
  INTO v_removed_ids
  FROM removed;

  DELETE FROM public.external_calendar_events AS event
  WHERE event.user_id = p_user_id
    AND event.connection_id = p_connection_id
    AND event.provider_calendar_id = ANY(v_removed_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.plans AS plan
      WHERE plan.user_id = p_user_id
        AND plan.external_calendar_event_id = event.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.records AS record
      WHERE record.user_id = p_user_id
        AND record.external_calendar_event_id = event.id
    );

  UPDATE public.calendar_connections AS connection
  SET sync_sequence = connection.sync_sequence + 1
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id
    AND connection.sync_sequence < 9223372036854775807::BIGINT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar sync sequence exhausted'
      USING ERRCODE = '54000';
  END IF;

  RETURN 'updated';
END;
$$;

REVOKE ALL ON FUNCTION public.replace_selected_calendars_command_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_selected_calendars_command_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, JSONB
) TO service_role;

COMMENT ON FUNCTION public.replace_selected_calendars_command_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, JSONB
) IS
  'Atomically replaces selected calendars, preserves surviving cursors, prunes only unreferenced removed mirrors, and advances the connection sequence to supersede in-flight syncs; service role only.';

COMMIT;
