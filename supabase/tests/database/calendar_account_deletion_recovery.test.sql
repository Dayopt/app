-- Rollback-only crash, expiry, and retention smoke for Calendar account deletion.

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
  v_crash_user CONSTANT UUID := '11000000-0000-4000-8000-000000000001';
  v_retry_user CONSTANT UUID := '11000000-0000-4000-8000-000000000002';
  v_expiry_user CONSTANT UUID := '11000000-0000-4000-8000-000000000003';
  v_near_expiry_user CONSTANT UUID :=
    '11000000-0000-4000-8000-000000000004';
  v_crash_connection CONSTANT UUID :=
    '51000000-0000-4000-8000-000000000001';
  v_retry_connection_a CONSTANT UUID :=
    '51000000-0000-4000-8000-000000000002';
  v_retry_connection_b CONSTANT UUID :=
    '51000000-0000-4000-8000-000000000003';
  v_expiry_connection CONSTANT UUID :=
    '51000000-0000-4000-8000-000000000004';
  v_near_expiry_connection CONSTANT UUID :=
    '51000000-0000-4000-8000-000000000005';
  v_crash_deletion CONSTANT UUID :=
    '81000000-0000-4000-8000-000000000001';
  v_crash_retry_deletion CONSTANT UUID :=
    '81000000-0000-4000-8000-000000000002';
  v_retry_deletion CONSTANT UUID :=
    '81000000-0000-4000-8000-000000000003';
  v_retry_replacement_deletion CONSTANT UUID :=
    '81000000-0000-4000-8000-000000000004';
  v_expiry_deletion CONSTANT UUID :=
    '81000000-0000-4000-8000-000000000005';
  v_near_expiry_deletion CONSTANT UUID :=
    '81000000-0000-4000-8000-000000000006';
  v_disconnect_operation CONSTANT UUID :=
    '71000000-0000-4000-8000-000000000001';
  v_near_expiry_disconnect_operation CONSTANT UUID :=
    '71000000-0000-4000-8000-000000000002';
  v_subject_fence_id UUID;
  v_subject_epoch BIGINT;
  v_item RECORD;
  v_prepare RECORD;
  v_prepare_a RECORD;
  v_prepare_b RECORD;
  v_expiry_result RECORD;
  v_result TEXT;
  v_count INTEGER;
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
  ) VALUES
    (
      v_crash_user,
      'authenticated',
      'authenticated',
      'calendar-delete-crash@example.com',
      '',
      '{}'::JSONB,
      '{}'::JSONB,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_retry_user,
      'authenticated',
      'authenticated',
      'calendar-delete-retry@example.com',
      '',
      '{}'::JSONB,
      '{}'::JSONB,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_expiry_user,
      'authenticated',
      'authenticated',
      'calendar-delete-expiry@example.com',
      '',
      '{}'::JSONB,
      '{}'::JSONB,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_near_expiry_user,
      'authenticated',
      'authenticated',
      'calendar-delete-near-expiry@example.com',
      '',
      '{}'::JSONB,
      '{}'::JSONB,
      pg_catalog.now(),
      pg_catalog.now()
    );

  -- A crash immediately after durable dispatch has no retained ciphertext.
  v_subject_fence_id := private.get_or_create_calendar_subject_fence_v1(
    v_project_key,
    'google-delete-crash-subject'
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
    v_crash_connection,
    v_crash_user,
    'google',
    'google-delete-crash-subject',
    'calendar-delete-crash-subject@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.crash-ciphertext',
    'active',
    0,
    v_subject_fence_id,
    v_subject_epoch
  );

  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  SELECT *
  INTO v_item
  FROM public.begin_calendar_account_deletion_v1(
    v_crash_deletion,
    v_project_key,
    v_crash_user
  )
  WHERE item_kind = 'connection';

  SELECT *
  INTO v_prepare
  FROM public.prepare_calendar_account_delete_revoke_v1(
    v_crash_deletion,
    gen_random_uuid(),
    v_project_key,
    v_crash_user,
    v_item.item_kind,
    v_item.item_id
  );

  IF public.abandon_calendar_account_delete_revoke_v1(
    v_crash_deletion,
    v_project_key,
    v_crash_user,
    v_prepare.operation_id,
    gen_random_uuid(),
    'decrypt_failed'
  ) <> 'superseded' THEN
    RAISE EXCEPTION 'wrong account-delete lease was not superseded';
  END IF;

  IF public.start_calendar_account_delete_provider_attempt_v1(
    v_crash_deletion,
    v_project_key,
    v_crash_user,
    v_prepare.operation_id,
    v_prepare.lease_id
  ) <> 'started' THEN
    RAISE EXCEPTION 'crash fixture dispatch did not start';
  END IF;

  IF public.abandon_calendar_account_delete_revoke_v1(
    v_crash_deletion,
    v_project_key,
    v_crash_user,
    v_prepare.operation_id,
    v_prepare.lease_id,
    'decrypt_failed'
  ) <> 'attempt_started' THEN
    RAISE EXCEPTION 'started provider attempt was overwritten by abandon';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calendar_connections AS connection
    WHERE connection.id = v_crash_connection
  ) THEN
    RAISE EXCEPTION 'durable dispatch retained connection ciphertext';
  END IF;

  UPDATE private.calendar_account_deletion_intents AS intent
  SET started_at = pg_catalog.clock_timestamp() - INTERVAL '16 minutes',
      expires_at = pg_catalog.clock_timestamp() - INTERVAL '1 minute 1 second'
  WHERE intent.deletion_id = v_crash_deletion;

  UPDATE private.calendar_revoke_operations AS operation
  SET active_lease_expires_at =
    pg_catalog.clock_timestamp() - INTERVAL '11 minutes'
  WHERE operation.operation_id = v_prepare.operation_id;

  SELECT *
  INTO v_expiry_result
  FROM public.expire_calendar_revoke_authority_v3(v_project_key, 100);

  IF NOT EXISTS (
    SELECT 1
    FROM public.list_expired_calendar_account_deletion_intents_v1(
      v_project_key,
      100
    ) AS candidate
    WHERE candidate.user_id = v_crash_user
      AND candidate.deletion_id = v_crash_deletion
  ) THEN
    RAISE EXCEPTION 'expired crash intent was not listed for per-user normalization';
  END IF;

  v_result := public.normalize_calendar_account_deletion_intent_v1(
    v_project_key,
    v_crash_user,
    v_crash_deletion
  );

  IF v_result <> 'normalized'
    OR EXISTS (
      SELECT 1
      FROM private.calendar_account_deletion_intents AS intent
      WHERE intent.deletion_id = v_crash_deletion
    )
    OR (
      SELECT operation.provider_attempt_outcome
      FROM private.calendar_revoke_operations AS operation
      WHERE operation.operation_id = v_prepare.operation_id
    ) IS DISTINCT FROM 'unconfirmed' THEN
    RAISE EXCEPTION 'crash-after-start was not normalized as unconfirmed: %', v_result;
  END IF;

  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  PERFORM 1
  FROM public.begin_calendar_account_deletion_v1(
    v_crash_retry_deletion,
    v_project_key,
    v_crash_user
  );

  IF NOT public.seal_calendar_account_deletion_v1(
    v_crash_retry_deletion,
    v_project_key,
    v_crash_user
  ) THEN
    RAISE EXCEPTION 'crash retry could not seal without a second provider call';
  END IF;

  DELETE FROM auth.users AS auth_user
  WHERE auth_user.id = v_crash_user;

  -- A completed item plus an expired, never-started item can roll forward
  -- under a new deletion identity. The never-started source remains intact.
  FOREACH v_count IN ARRAY ARRAY[1, 2]
  LOOP
    v_subject_fence_id := private.get_or_create_calendar_subject_fence_v1(
      v_project_key,
      'google-delete-retry-subject-' || v_count::TEXT
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
      CASE
        WHEN v_count = 1 THEN v_retry_connection_a
        ELSE v_retry_connection_b
      END,
      v_retry_user,
      'google',
      'google-delete-retry-subject-' || v_count::TEXT,
      'calendar-delete-retry-' || v_count::TEXT || '@example.com',
      ARRAY['calendar.readonly']::TEXT[],
      'v1.retry-ciphertext-' || v_count::TEXT,
      'active',
      0,
      v_subject_fence_id,
      v_subject_epoch
    );
  END LOOP;

  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  PERFORM 1
  FROM public.begin_calendar_account_deletion_v1(
    v_retry_deletion,
    v_project_key,
    v_retry_user
  );

  SELECT *
  INTO v_prepare_a
  FROM public.prepare_calendar_account_delete_revoke_v1(
    v_retry_deletion,
    gen_random_uuid(),
    v_project_key,
    v_retry_user,
    'connection',
    v_retry_connection_a
  );

  IF public.start_calendar_account_delete_provider_attempt_v1(
    v_retry_deletion,
    v_project_key,
    v_retry_user,
    v_prepare_a.operation_id,
    v_prepare_a.lease_id
  ) <> 'started'
    OR public.finalize_calendar_account_delete_revoke_v1(
      v_retry_deletion,
      v_project_key,
      v_retry_user,
      v_prepare_a.operation_id,
      v_prepare_a.lease_id,
      'confirmed'
    ) <> 'revoke_guarded' THEN
    RAISE EXCEPTION 'first multi-item deletion item did not complete';
  END IF;

  SELECT *
  INTO v_prepare_b
  FROM public.prepare_calendar_account_delete_revoke_v1(
    v_retry_deletion,
    gen_random_uuid(),
    v_project_key,
    v_retry_user,
    'connection',
    v_retry_connection_b
  );

  UPDATE private.calendar_account_deletion_intents AS intent
  SET started_at = pg_catalog.clock_timestamp() - INTERVAL '16 minutes',
      expires_at = pg_catalog.clock_timestamp() - INTERVAL '1 minute 1 second'
  WHERE intent.deletion_id = v_retry_deletion;

  UPDATE private.calendar_revoke_operations AS operation
  SET created_at = pg_catalog.clock_timestamp() - INTERVAL '23 hours 58 minutes',
      expires_at = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE operation.operation_id = v_prepare_b.operation_id;

  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_count
  FROM public.begin_calendar_account_deletion_v1(
    v_retry_replacement_deletion,
    v_project_key,
    v_retry_user
  )
  WHERE item_kind = 'connection'
    AND item_id = v_retry_connection_b;

  IF v_count <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM public.calendar_connections AS connection
      WHERE connection.id = v_retry_connection_b
        AND connection.refresh_token_enc = 'v1.retry-ciphertext-2'
    )
    OR (
      SELECT operation.state
      FROM private.calendar_revoke_operations AS operation
      WHERE operation.operation_id = v_prepare_b.operation_id
    ) IS DISTINCT FROM 'expired' THEN
    RAISE EXCEPTION 'expired never-started item was not safely replaced';
  END IF;

  IF public.abandon_calendar_account_delete_revoke_v1(
    v_retry_deletion,
    v_project_key,
    v_retry_user,
    v_prepare_b.operation_id,
    v_prepare_b.lease_id,
    'decrypt_failed'
  ) <> 'superseded' THEN
    RAISE EXCEPTION 'stale abandon was indistinguishable from terminal success';
  END IF;

  SELECT *
  INTO v_prepare_b
  FROM public.prepare_calendar_account_delete_revoke_v1(
    v_retry_replacement_deletion,
    gen_random_uuid(),
    v_project_key,
    v_retry_user,
    'connection',
    v_retry_connection_b
  );

  IF public.abandon_calendar_account_delete_revoke_v1(
    v_retry_replacement_deletion,
    v_project_key,
    v_retry_user,
    v_prepare_b.operation_id,
      v_prepare_b.lease_id,
      'decrypt_failed'
  ) <> 'not_attempted'
    OR public.abandon_calendar_account_delete_revoke_v1(
      v_retry_replacement_deletion,
      v_project_key,
      v_retry_user,
      v_prepare_b.operation_id,
      v_prepare_b.lease_id,
      'decrypt_failed'
    ) <> 'not_attempted'
    OR NOT public.seal_calendar_account_deletion_v1(
      v_retry_replacement_deletion,
      v_project_key,
      v_retry_user
    ) THEN
    RAISE EXCEPTION 'replacement deletion did not roll forward';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calendar_connections AS connection
    WHERE connection.id = v_retry_connection_b
  ) OR NOT EXISTS (
    SELECT 1
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.operation_id = v_prepare_b.operation_id
      AND operation.provider_attempt_started_at IS NULL
      AND operation.provider_attempt_outcome = 'not_attempted'
      AND operation.provider_attempt_reason = 'decrypt_failed'
      AND operation.state = 'expired'
  ) OR NOT EXISTS (
    SELECT 1
    FROM private.calendar_authority_fences AS fence
    WHERE fence.id = v_subject_fence_id
      AND fence.pending_operation_count = 0
      AND fence.state = 'ready'
  ) THEN
    RAISE EXCEPTION 'decrypt-failed terminal receipt did not consume its source';
  END IF;

  BEGIN
    PERFORM public.abandon_calendar_account_delete_revoke_v1(
      v_retry_replacement_deletion,
      v_project_key,
      v_retry_user,
      v_prepare_b.operation_id,
      v_prepare_b.lease_id,
      'source_expired'
    );
    RAISE EXCEPTION 'not-attempted replay accepted a changed reason';
  EXCEPTION
    WHEN SQLSTATE 'CA004' THEN
      NULL;
  END;

  DELETE FROM auth.users AS auth_user
  WHERE auth_user.id = v_retry_user;

  -- Hard expiry remains unconditional even while account deletion owns a
  -- prepared outbox item. The expired exact lease can only record that no
  -- provider request was attempted; it cannot start HTTP after its deadline.
  v_subject_fence_id := private.get_or_create_calendar_subject_fence_v1(
    v_project_key,
    'google-delete-expiry-subject'
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
    v_expiry_connection,
    v_expiry_user,
    'google',
    'google-delete-expiry-subject',
    'calendar-delete-expiry-subject@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.expiry-ciphertext',
    'active',
    0,
    v_subject_fence_id,
    v_subject_epoch
  );

  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  IF public.disconnect_calendar_connection_command_v1(
    v_disconnect_operation,
    v_project_key,
    v_expiry_user,
    v_expiry_connection
  ) <> 'queued' THEN
    RAISE EXCEPTION 'hard-expiry fixture was not queued';
  END IF;

  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  PERFORM 1
  FROM public.begin_calendar_account_deletion_v1(
    v_expiry_deletion,
    v_project_key,
    v_expiry_user
  );

  SELECT *
  INTO v_prepare
  FROM public.prepare_calendar_account_delete_revoke_v1(
    v_expiry_deletion,
    gen_random_uuid(),
    v_project_key,
    v_expiry_user,
    'outbox',
    v_disconnect_operation
  );

  UPDATE private.calendar_revoke_operations AS operation
  SET created_at = pg_catalog.clock_timestamp() - INTERVAL '1 hour',
      expires_at = pg_catalog.clock_timestamp() - INTERVAL '1 second',
      active_lease_expires_at = CASE
        WHEN operation.operation_id = v_prepare.operation_id
          THEN pg_catalog.clock_timestamp() - INTERVAL '1 second'
        ELSE operation.active_lease_expires_at
      END
  WHERE operation.operation_id IN (
      v_disconnect_operation,
      v_prepare.operation_id
    );

  UPDATE private.calendar_revoke_outbox AS queued
  SET created_at = pg_catalog.clock_timestamp() - INTERVAL '1 hour',
      expires_at = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE queued.id = v_disconnect_operation;

  SELECT *
  INTO v_expiry_result
  FROM public.expire_calendar_revoke_authority_v3(
    v_project_key,
    100
  );

  IF v_expiry_result.ciphertexts_deleted <> 1
    OR v_expiry_result.ciphertexts_deferred <> 0
    OR EXISTS (
    SELECT 1
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id = v_disconnect_operation
  ) THEN
    RAISE EXCEPTION 'active deletion suppressed the ciphertext hard expiry';
  END IF;

  IF (
    SELECT operation.state
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.operation_id = v_prepare.operation_id
  ) <> 'pending' THEN
    RAISE EXCEPTION 'generic hard expiry consumed the account-deletion wrapper lease';
  END IF;

  IF public.start_calendar_account_delete_provider_attempt_v1(
    v_expiry_deletion,
    v_project_key,
    v_expiry_user,
    v_prepare.operation_id,
    v_prepare.lease_id
  ) <> 'superseded'
    OR public.abandon_calendar_account_delete_revoke_v1(
      v_expiry_deletion,
      v_project_key,
      v_expiry_user,
      v_prepare.operation_id,
      v_prepare.lease_id,
      'source_expired'
    ) <> 'not_attempted'
    OR public.abandon_calendar_account_delete_revoke_v1(
      v_expiry_deletion,
      v_project_key,
      v_expiry_user,
      v_prepare.operation_id,
      v_prepare.lease_id,
      'source_expired'
    ) <> 'not_attempted'
    OR public.start_calendar_account_delete_provider_attempt_v1(
      v_expiry_deletion,
      v_project_key,
      v_expiry_user,
      v_prepare.operation_id,
      v_prepare.lease_id
    ) <> 'expired'
    OR public.cancel_calendar_account_deletion_v1(
      v_expiry_deletion,
      v_expiry_user
    )
    OR NOT public.seal_calendar_account_deletion_v1(
      v_expiry_deletion,
      v_project_key,
      v_expiry_user
    ) THEN
    RAISE EXCEPTION 'hard-expired source did not settle as not-attempted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.operation_id = v_prepare.operation_id
      AND operation.provider_attempt_started_at IS NULL
      AND operation.provider_attempt_outcome = 'not_attempted'
      AND operation.provider_attempt_reason = 'source_expired'
      AND operation.state = 'expired'
      AND operation.active_lease_id IS NULL
      AND operation.active_lease_expires_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM private.calendar_authority_fences AS fence
    WHERE fence.id = v_subject_fence_id
      AND fence.pending_operation_count = 0
      AND fence.state = 'ready'
  ) THEN
    RAISE EXCEPTION 'hard-expired source receipt shape was not terminal';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM private.calendar_account_deletion_intents AS intent
    WHERE intent.deletion_id = v_expiry_deletion
      AND intent.state = 'ready'
      AND intent.sealed_operation_count = 1
      AND intent.sealed_receipt_digest IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ready deletion did not persist seal audit coverage';
  END IF;

  UPDATE private.calendar_revoke_operations AS operation
  SET guard_until = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE operation.account_deletion_id = v_expiry_deletion
    AND operation.state IN ('revoke_guarded', 'expiry_guarded');

  PERFORM private.finalize_calendar_revoke_guards_internal_v1(100);

  UPDATE private.calendar_revoke_operations AS operation
  SET settled_at = pg_catalog.clock_timestamp() - INTERVAL '90 days',
      delete_after = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE operation.account_deletion_id = v_expiry_deletion
    AND operation.state IN ('revoked', 'expired');

  PERFORM public.cleanup_calendar_revoke_operations_v1(v_project_key, 100);

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.account_deletion_id = v_expiry_deletion
  ) THEN
    RAISE EXCEPTION 'expired account-delete receipt was not cleaned';
  END IF;

  DELETE FROM auth.users AS auth_user
  WHERE auth_user.id = v_expiry_user;

  -- An inventoried outbox with less than the dispatch safety budget is still
  -- represented by a strict terminal receipt before its ciphertext is removed.
  v_subject_fence_id := private.get_or_create_calendar_subject_fence_v1(
    v_project_key,
    'google-delete-near-expiry-subject'
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
    v_near_expiry_connection,
    v_near_expiry_user,
    'google',
    'google-delete-near-expiry-subject',
    'calendar-delete-near-expiry@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.near-expiry-ciphertext',
    'active',
    0,
    v_subject_fence_id,
    v_subject_epoch
  );

  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  IF public.disconnect_calendar_connection_command_v1(
    v_near_expiry_disconnect_operation,
    v_project_key,
    v_near_expiry_user,
    v_near_expiry_connection
  ) <> 'queued' THEN
    RAISE EXCEPTION 'near-expiry fixture was not queued';
  END IF;

  UPDATE private.calendar_revoke_operations AS operation
  SET expires_at = pg_catalog.clock_timestamp() + INTERVAL '20 seconds'
  WHERE operation.operation_id = v_near_expiry_disconnect_operation;

  UPDATE private.calendar_revoke_outbox AS queued
  SET expires_at = pg_catalog.clock_timestamp() + INTERVAL '20 seconds'
  WHERE queued.id = v_near_expiry_disconnect_operation;

  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  PERFORM 1
  FROM public.begin_calendar_account_deletion_v1(
    v_near_expiry_deletion,
    v_project_key,
    v_near_expiry_user
  );

  SELECT *
  INTO v_prepare
  FROM public.prepare_calendar_account_delete_revoke_v1(
    v_near_expiry_deletion,
    gen_random_uuid(),
    v_project_key,
    v_near_expiry_user,
    'outbox',
    v_near_expiry_disconnect_operation
  );

  IF v_prepare.result <> 'not_attempted'
    OR v_prepare.refresh_token_enc IS NOT NULL
    OR v_prepare.lease_id IS NOT NULL THEN
    RAISE EXCEPTION 'near-expiry prepare did not return a terminal result';
  END IF;

  SELECT *
  INTO v_prepare_a
  FROM public.prepare_calendar_account_delete_revoke_v1(
    v_near_expiry_deletion,
    gen_random_uuid(),
    v_project_key,
    v_near_expiry_user,
    'outbox',
    v_near_expiry_disconnect_operation
  );

  IF v_prepare_a.result <> 'not_attempted'
    OR v_prepare_a.operation_id IS DISTINCT FROM v_prepare.operation_id
    OR v_prepare_a.refresh_token_enc IS NOT NULL
    OR v_prepare_a.lease_id IS NOT NULL
    OR v_prepare_a.lease_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'near-expiry prepare replay changed its terminal result';
  END IF;

  IF EXISTS (
      SELECT 1
      FROM private.calendar_revoke_outbox AS queued
      WHERE queued.id = v_near_expiry_disconnect_operation
    ) THEN
    RAISE EXCEPTION 'near-expiry prepare retained source ciphertext';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM private.calendar_revoke_operations AS operation
      WHERE operation.operation_id = v_prepare.operation_id
        AND operation.provider_attempt_started_at IS NULL
        AND operation.provider_attempt_outcome = 'not_attempted'
        AND operation.provider_attempt_reason = 'source_expired'
        AND operation.state = 'expired'
    ) THEN
    RAISE EXCEPTION 'near-expiry prepare did not retain a terminal receipt';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM private.calendar_authority_fences AS fence
      WHERE fence.id = v_subject_fence_id
        AND fence.pending_operation_count = 0
        AND fence.state = 'ready'
    ) THEN
    RAISE EXCEPTION 'near-expiry prepare did not settle its subject fence';
  END IF;

  IF NOT public.seal_calendar_account_deletion_v1(
      v_near_expiry_deletion,
      v_project_key,
      v_near_expiry_user
    ) THEN
    RAISE EXCEPTION 'near-expiry deletion did not seal';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM private.calendar_account_deletion_intents AS intent
      WHERE intent.deletion_id = v_near_expiry_deletion
        AND intent.state = 'ready'
        AND intent.sealed_operation_count = 1
        AND intent.sealed_receipt_digest IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'near-expiry deletion did not persist terminal audit coverage';
  END IF;

  DELETE FROM auth.users AS auth_user
  WHERE auth_user.id = v_near_expiry_user;
END;
$$;

SELECT pass('Calendar account deletion recovers without repeating provider attempts');
SELECT * FROM finish();

ROLLBACK;
