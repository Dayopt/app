-- Rollback-only ordering smoke for fenced Calendar selection and sync writers.

BEGIN;

SELECT plan(1);

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  TRUE
);

DO $$
DECLARE
  v_project_key CONSTANT TEXT := '123456789012';
  v_client_id CONSTANT TEXT :=
    '123456789012-dayoptcalendar.apps.googleusercontent.com';
  v_user_id CONSTANT UUID := '12000000-0000-4000-8000-000000000001';
  v_connection_id CONSTANT UUID :=
    '52000000-0000-4000-8000-000000000001';
  v_subject_fence_id UUID;
  v_subject_epoch BIGINT;
  v_selection_id UUID;
  v_readded_selection_id UUID;
  v_event_id UUID;
  v_plan_event_id UUID;
  v_record_event_id UUID;
  v_unreferenced_event_id UUID;
  v_run_a RECORD;
  v_run_b RECORD;
  v_run_c RECORD;
  v_run_d RECORD;
  v_run_e RECORD;
  v_run_f RECORD;
  v_run_g RECORD;
  v_result TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM private.calendar_authority_projects AS project
    WHERE project.singleton
  ) THEN
    PERFORM public.provision_calendar_authority_project_v1(
      v_project_key,
      v_client_id
    );
  END IF;

  UPDATE private.calendar_authority_projects AS project
  SET activation_version = 1,
      activated_at = COALESCE(
        project.activated_at,
        pg_catalog.clock_timestamp()
      )
  WHERE project.singleton;

  INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    'authenticated',
    'authenticated',
    'calendar-sync-writer@example.com',
    '',
    '{}'::JSONB,
    '{}'::JSONB,
    pg_catalog.now(),
    pg_catalog.now()
  );

  v_subject_fence_id := private.get_or_create_calendar_subject_fence_v1(
    v_project_key,
    'google-sync-writer-subject'
  );
  SELECT fence.epoch
  INTO v_subject_epoch
  FROM private.calendar_authority_fences AS fence
  WHERE fence.id = v_subject_fence_id;

  INSERT INTO public.calendar_connections (
    id,
    user_id,
    provider,
    provider_account_id,
    provider_account_email,
    granted_scopes,
    refresh_token_enc,
    status,
    data_generation,
    authority_fence_id,
    authority_epoch
  ) VALUES (
    v_connection_id,
    v_user_id,
    'google',
    'google-sync-writer-subject',
    'calendar-sync-writer-subject@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.sync-writer-ciphertext',
    'active',
    0,
    v_subject_fence_id,
    v_subject_epoch
  );

  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  IF public.replace_selected_calendars_command_v1(
    v_project_key,
    v_user_id,
    v_connection_id,
    0,
    v_subject_fence_id,
    v_subject_epoch,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'providerCalendarId', 'primary',
        'calendarName', 'Primary'
      )
    )
  ) <> 'updated' THEN
    RAISE EXCEPTION 'initial selected-calendar replacement failed';
  END IF;

  SELECT calendar.id
  INTO v_selection_id
  FROM public.calendar_connection_calendars AS calendar
  WHERE calendar.connection_id = v_connection_id
    AND calendar.provider_calendar_id = 'primary';

  SELECT *
  INTO v_run_a
  FROM public.begin_calendar_sync_run_v1(
    v_project_key,
    v_user_id,
    v_connection_id
  );

  SELECT *
  INTO v_run_b
  FROM public.begin_calendar_sync_run_v1(
    v_project_key,
    v_user_id,
    v_connection_id
  );

  IF v_run_a.result <> 'started'
    OR v_run_b.result <> 'started'
    OR v_run_b.sync_sequence <= v_run_a.sync_sequence
    OR v_run_a.run_started_at IS NULL
    OR v_run_b.run_started_at IS NULL THEN
    RAISE EXCEPTION 'database sync ordering identity was not issued';
  END IF;

  v_result := public.persist_calendar_sync_result_command_v1(
    v_project_key,
    v_user_id,
    v_connection_id,
    v_run_a.data_generation,
    v_run_a.authority_fence_id,
    v_run_a.authority_epoch,
    v_run_a.sync_sequence,
    v_selection_id,
    'primary',
    v_run_a.run_started_at,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'providerEventId', 'event-1',
        'title', 'stale title',
        'startAt', v_run_a.run_started_at + INTERVAL '1 hour',
        'endAt', v_run_a.run_started_at + INTERVAL '2 hours'
      )
    ),
    ARRAY[]::TEXT[],
    TRUE,
    'cursor-stale'
  );

  IF v_result <> 'superseded'
    OR public.finish_calendar_sync_run_v1(
      v_project_key,
      v_user_id,
      v_connection_id,
      v_run_a.data_generation,
      v_run_a.authority_fence_id,
      v_run_a.authority_epoch,
      v_run_a.sync_sequence,
      v_run_a.run_started_at,
      'provider_unavailable',
      FALSE,
      NULL,
      NULL
    ) <> 'superseded' THEN
    RAISE EXCEPTION 'older sync run was not superseded';
  END IF;

  IF public.persist_calendar_sync_result_command_v1(
    v_project_key,
    v_user_id,
    v_connection_id,
    v_run_b.data_generation,
    v_run_b.authority_fence_id,
    v_run_b.authority_epoch,
    v_run_b.sync_sequence,
    v_selection_id,
    'primary',
    v_run_b.run_started_at,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'providerEventId', 'event-1',
        'title', 'current title',
        'startAt', v_run_b.run_started_at + INTERVAL '1 hour',
        'endAt', v_run_b.run_started_at + INTERVAL '2 hours'
      )
    ),
    ARRAY[]::TEXT[],
    TRUE,
    'cursor-current'
  ) <> 'persisted'
    OR public.finish_calendar_sync_run_v1(
      v_project_key,
      v_user_id,
      v_connection_id,
      v_run_b.data_generation,
      v_run_b.authority_fence_id,
      v_run_b.authority_epoch,
      v_run_b.sync_sequence,
      v_run_b.run_started_at,
      NULL,
      FALSE,
      NULL,
      NULL
    ) <> 'finished' THEN
    RAISE EXCEPTION 'latest sync run did not publish atomically';
  END IF;

  SELECT event.id
  INTO v_event_id
  FROM public.external_calendar_events AS event
  WHERE event.connection_id = v_connection_id
    AND event.provider_event_id = 'event-1';

  IF (
      SELECT event.title
      FROM public.external_calendar_events AS event
      WHERE event.id = v_event_id
    ) IS DISTINCT FROM 'current title'
    OR (
      SELECT calendar.sync_token
      FROM public.calendar_connection_calendars AS calendar
      WHERE calendar.id = v_selection_id
    ) IS DISTINCT FROM 'cursor-current'
    OR (
      SELECT connection.last_sync_error
      FROM public.calendar_connections AS connection
      WHERE connection.id = v_connection_id
    ) IS NOT NULL THEN
    RAISE EXCEPTION 'stale sync overwrote the current event, cursor, or status';
  END IF;

  UPDATE public.external_calendar_events AS event
  SET dismissed_at = pg_catalog.clock_timestamp()
  WHERE event.id = v_event_id;

  SELECT *
  INTO v_run_f
  FROM public.begin_calendar_sync_run_v1(
    v_project_key,
    v_user_id,
    v_connection_id
  );

  IF public.persist_calendar_sync_result_command_v1(
    v_project_key,
    v_user_id,
    v_connection_id,
    v_run_f.data_generation,
    v_run_f.authority_fence_id,
    v_run_f.authority_epoch,
    v_run_f.sync_sequence,
    v_selection_id,
    'primary',
    v_run_f.run_started_at,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'providerEventId', 'event-1',
        'title', 'current title updated',
        'startAt', v_run_f.run_started_at + INTERVAL '1 hour',
        'endAt', v_run_f.run_started_at + INTERVAL '2 hours'
      )
    ),
    ARRAY[]::TEXT[],
    FALSE,
    'cursor-final'
  ) <> 'persisted'
    OR (
      SELECT event.dismissed_at
      FROM public.external_calendar_events AS event
      WHERE event.id = v_event_id
    ) IS NULL THEN
    RAISE EXCEPTION 'latest event upsert did not preserve dismissed state';
  END IF;

  SELECT *
  INTO v_run_c
  FROM public.begin_calendar_sync_run_v1(
    v_project_key,
    v_user_id,
    v_connection_id
  );

  PERFORM public.replace_selected_calendars_command_v1(
    v_project_key,
    v_user_id,
    v_connection_id,
    v_run_c.data_generation,
    v_run_c.authority_fence_id,
    v_run_c.authority_epoch,
    '[]'::JSONB
  );
  PERFORM public.replace_selected_calendars_command_v1(
    v_project_key,
    v_user_id,
    v_connection_id,
    v_run_c.data_generation,
    v_run_c.authority_fence_id,
    v_run_c.authority_epoch,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'providerCalendarId', 'primary',
        'calendarName', 'Primary re-added'
      )
    )
  );

  SELECT calendar.id
  INTO v_readded_selection_id
  FROM public.calendar_connection_calendars AS calendar
  WHERE calendar.connection_id = v_connection_id
    AND calendar.provider_calendar_id = 'primary';

  IF v_readded_selection_id IS NOT DISTINCT FROM v_selection_id
    OR public.persist_calendar_sync_result_command_v1(
      v_project_key,
      v_user_id,
      v_connection_id,
      v_run_c.data_generation,
      v_run_c.authority_fence_id,
      v_run_c.authority_epoch,
      v_run_c.sync_sequence,
      v_selection_id,
      'primary',
      v_run_c.run_started_at,
      '[]'::JSONB,
      ARRAY[]::TEXT[],
      TRUE,
      'cursor-after-readd'
    ) <> 'superseded' THEN
    RAISE EXCEPTION 'selection remove/re-add did not invalidate the old run';
  END IF;

  SELECT *
  INTO v_run_d
  FROM public.begin_calendar_sync_run_v1(
    v_project_key,
    v_user_id,
    v_connection_id
  );
  SELECT *
  INTO v_run_e
  FROM public.begin_calendar_sync_run_v1(
    v_project_key,
    v_user_id,
    v_connection_id
  );

  IF public.clear_calendar_sync_cursor_command_v1(
    v_project_key,
    v_user_id,
    v_connection_id,
    v_run_d.data_generation,
    v_run_d.authority_fence_id,
    v_run_d.authority_epoch,
    v_run_d.sync_sequence,
    v_readded_selection_id,
    'primary',
    NULL
  ) <> 'superseded' THEN
    RAISE EXCEPTION 'older 410 fallback could mutate a newer cursor';
  END IF;

  SELECT *
  INTO v_run_g
  FROM public.begin_calendar_sync_run_v1(
    v_project_key,
    v_user_id,
    v_connection_id
  );

  INSERT INTO public.external_calendar_events (
    user_id,
    connection_id,
    provider,
    provider_calendar_id,
    provider_event_id,
    title,
    start_at,
    end_at,
    status,
    last_synced_at
  ) VALUES (
    v_user_id,
    v_connection_id,
    'google',
    'primary',
    'plan-referenced-outside-window',
    'Plan referenced',
    v_run_g.run_started_at + INTERVAL '200 days',
    v_run_g.run_started_at + INTERVAL '200 days 1 hour',
    'confirmed',
    v_run_g.run_started_at - INTERVAL '1 second'
  )
  RETURNING id INTO v_plan_event_id;

  INSERT INTO public.external_calendar_events (
    user_id,
    connection_id,
    provider,
    provider_calendar_id,
    provider_event_id,
    title,
    start_at,
    end_at,
    status,
    last_synced_at
  ) VALUES (
    v_user_id,
    v_connection_id,
    'google',
    'primary',
    'record-referenced-outside-window',
    'Record referenced',
    v_run_g.run_started_at - INTERVAL '201 days',
    v_run_g.run_started_at - INTERVAL '201 days' + INTERVAL '1 hour',
    'confirmed',
    v_run_g.run_started_at - INTERVAL '1 second'
  )
  RETURNING id INTO v_record_event_id;

  INSERT INTO public.external_calendar_events (
    user_id,
    connection_id,
    provider,
    provider_calendar_id,
    provider_event_id,
    title,
    start_at,
    end_at,
    status,
    last_synced_at
  ) VALUES (
    v_user_id,
    v_connection_id,
    'google',
    'primary',
    'unreferenced-outside-window',
    'Unreferenced',
    v_run_g.run_started_at + INTERVAL '202 days',
    v_run_g.run_started_at + INTERVAL '202 days 1 hour',
    'confirmed',
    v_run_g.run_started_at - INTERVAL '1 second'
  )
  RETURNING id INTO v_unreferenced_event_id;

  INSERT INTO public.plans (
    user_id,
    external_calendar_event_id,
    title,
    start_at,
    end_at,
    source
  ) VALUES (
    v_user_id,
    v_plan_event_id,
    'Plan reference',
    v_run_g.run_started_at + INTERVAL '200 days',
    v_run_g.run_started_at + INTERVAL '200 days 1 hour',
    'external_calendar'
  );

  INSERT INTO public.records (
    user_id,
    external_calendar_event_id,
    title,
    start_at,
    end_at,
    source
  ) VALUES (
    v_user_id,
    v_record_event_id,
    'Record reference',
    v_run_g.run_started_at - INTERVAL '201 days',
    v_run_g.run_started_at - INTERVAL '201 days' + INTERVAL '1 hour',
    'external_calendar'
  );

  v_result := public.finish_calendar_sync_run_v1(
    v_project_key,
    v_user_id,
    v_connection_id,
    v_run_g.data_generation,
    v_run_g.authority_fence_id,
    v_run_g.authority_epoch,
    v_run_g.sync_sequence,
    v_run_g.run_started_at,
    NULL,
    TRUE,
    v_run_g.run_started_at - INTERVAL '90 days',
    v_run_g.run_started_at + INTERVAL '90 days'
  );

  IF v_result <> 'finished' THEN
    RAISE EXCEPTION 'window prune did not finish: %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.external_calendar_events AS event
    WHERE event.id = v_plan_event_id
  ) THEN
    RAISE EXCEPTION 'window prune deleted a plan-referenced event';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.external_calendar_events AS event
    WHERE event.id = v_record_event_id
  ) THEN
    RAISE EXCEPTION 'window prune deleted a record-referenced event';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.external_calendar_events AS event
    WHERE event.id = v_unreferenced_event_id
  ) THEN
    RAISE EXCEPTION 'window prune preserved an unreferenced event';
  END IF;
END;
$$;

SELECT pass('Calendar sync writers reject stale runs and selections');
SELECT * FROM finish();

ROLLBACK;
