-- Rollback-only behavioral smoke for the Calendar authority boundary.

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
  v_user_id CONSTANT UUID := '10000000-0000-4000-8000-000000000001';
  v_other_user_id CONSTANT UUID := '10000000-0000-4000-8000-000000000002';
  v_delete_user_id CONSTANT UUID := '10000000-0000-4000-8000-000000000003';
  v_delete_connection_id CONSTANT UUID :=
    '50000000-0000-4000-8000-000000000003';
  v_delete_current_connection_id CONSTANT UUID :=
    '50000000-0000-4000-8000-000000000004';
  v_disconnect_operation_id CONSTANT UUID :=
    '70000000-0000-4000-8000-000000000003';
  v_deletion_id CONSTANT UUID :=
    '80000000-0000-4000-8000-000000000001';
  v_recovery_operation_id CONSTANT UUID :=
    '30000000-0000-4000-8000-000000000001';
  v_stale_save_operation_id UUID;
  v_rotation_a CONSTANT UUID := '60000000-0000-4000-8000-000000000001';
  v_rotation_b CONSTANT UUID := '60000000-0000-4000-8000-000000000002';
  v_direct_operation_id CONSTANT UUID :=
    '70000000-0000-4000-8000-000000000001';
  v_expiry_operation_id CONSTANT UUID :=
    '70000000-0000-4000-8000-000000000002';
  v_attempt_a RECORD;
  v_attempt_b RECORD;
  v_attempt_stale RECORD;
  v_attempt_unrelated RECORD;
  v_claim RECORD;
  v_connection RECORD;
  v_delete_item RECORD;
  v_delete_prepare RECORD;
  v_delete_subject_fence_id UUID;
  v_delete_subject_epoch BIGINT;
  v_not_started_tested BOOLEAN := FALSE;
  v_result TEXT;
  v_count INTEGER;
BEGIN
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
      v_user_id,
      'authenticated',
      'authenticated',
      'calendar-fence-a@example.com',
      '',
      '{}'::JSONB,
      '{}'::JSONB,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_other_user_id,
      'authenticated',
      'authenticated',
      'calendar-fence-b@example.com',
      '',
      '{}'::JSONB,
      '{}'::JSONB,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_delete_user_id,
      'authenticated',
      'authenticated',
      'calendar-fence-delete@example.com',
      '',
      '{}'::JSONB,
      '{}'::JSONB,
      pg_catalog.now(),
      pg_catalog.now()
    );

  IF public.provision_calendar_authority_project_v1(
    v_project_key,
    v_client_id
  ) <> 'provisioned' THEN
    RAISE EXCEPTION 'project was not provisioned';
  END IF;

  -- The contract-cutover draft owns this transition in rollout. This
  -- rollback-only smoke activates directly so the additive command drafts can
  -- be exercised before that final draft is appended.
  UPDATE private.calendar_authority_projects AS project
  SET activation_version = 1,
      activated_at = pg_catalog.clock_timestamp()
  WHERE project.singleton;

  SELECT *
  INTO v_attempt_a
  FROM public.begin_calendar_oauth_attempt_v1(
    v_project_key,
    v_user_id,
    pg_catalog.sha256(pg_catalog.convert_to('state-a', 'UTF8')),
    pg_catalog.sha256(pg_catalog.convert_to('verifier-a', 'UTF8'))
  );

  PERFORM 1
  FROM public.claim_calendar_oauth_attempt_v1(
    v_project_key,
    v_user_id,
    pg_catalog.sha256(pg_catalog.convert_to('state-a', 'UTF8')),
    pg_catalog.sha256(pg_catalog.convert_to('verifier-a', 'UTF8'))
  );

  v_result := public.save_calendar_connection_command_v2(
    v_attempt_a.attempt_id,
    v_project_key,
    v_user_id,
    'google',
    'google-subject-1',
    'subject-1@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.ciphertext-a'
  );

  IF v_result <> 'saved' THEN
    RAISE EXCEPTION 'initial save failed: %', v_result;
  END IF;

  SELECT
    connection.id,
    connection.authority_fence_id,
    connection.authority_epoch,
    connection.data_generation
  INTO v_connection
  FROM public.calendar_connections AS connection
  WHERE connection.user_id = v_user_id
    AND connection.provider_account_id = 'google-subject-1';

  -- A different Dayopt user can hold the same Google sub. A revoke against the
  -- subject must fail-close both rows.
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
    '50000000-0000-4000-8000-000000000002',
    v_other_user_id,
    'google',
    'google-subject-1',
    'subject-1-other@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.other-user-ciphertext',
    'active',
    0,
    v_connection.authority_fence_id,
    v_connection.authority_epoch
  );

  -- Capture one same-sub callback and one unrelated-sub callback before the
  -- revoke begins. Only the same-sub callback becomes stale.
  SELECT *
  INTO v_attempt_stale
  FROM public.begin_calendar_oauth_attempt_v1(
    v_project_key,
    v_user_id,
    pg_catalog.sha256(pg_catalog.convert_to('state-stale', 'UTF8')),
    pg_catalog.sha256(pg_catalog.convert_to('verifier-stale', 'UTF8'))
  );
  v_stale_save_operation_id := v_attempt_stale.operation_id;

  PERFORM 1
  FROM public.claim_calendar_oauth_attempt_v1(
    v_project_key,
    v_user_id,
    pg_catalog.sha256(pg_catalog.convert_to('state-stale', 'UTF8')),
    pg_catalog.sha256(pg_catalog.convert_to('verifier-stale', 'UTF8'))
  );

  SELECT *
  INTO v_attempt_unrelated
  FROM public.begin_calendar_oauth_attempt_v1(
    v_project_key,
    v_user_id,
    pg_catalog.sha256(pg_catalog.convert_to('state-unrelated', 'UTF8')),
    pg_catalog.sha256(pg_catalog.convert_to('verifier-unrelated', 'UTF8'))
  );

  PERFORM 1
  FROM public.claim_calendar_oauth_attempt_v1(
    v_project_key,
    v_user_id,
    pg_catalog.sha256(pg_catalog.convert_to('state-unrelated', 'UTF8')),
    pg_catalog.sha256(pg_catalog.convert_to('verifier-unrelated', 'UTF8'))
  );

  v_result := public.prepare_calendar_token_rotation_recovery_command_v2(
    v_recovery_operation_id,
    v_project_key,
    v_user_id,
    v_connection.id,
    v_connection.data_generation,
    v_connection.authority_fence_id,
    v_connection.authority_epoch,
    'v1.ciphertext-a',
    'v1.recovery-ciphertext',
    NULL
  );

  IF v_result <> 'marked' THEN
    RAISE EXCEPTION 'recovery did not mark the subject: %', v_result;
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_count
  FROM public.calendar_connections AS connection
  WHERE connection.provider_account_id = 'google-subject-1'
    AND connection.status = 'reauth_required';

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'same-sub cross-user rows were not fail-closed: %', v_count;
  END IF;

  v_result := public.save_calendar_connection_command_v2(
    v_attempt_unrelated.attempt_id,
    v_project_key,
    v_user_id,
    'google',
    'google-subject-2',
    'subject-2@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.unrelated-ciphertext'
  );

  IF v_result <> 'saved' THEN
    RAISE EXCEPTION 'unrelated subject was blocked by project churn: %', v_result;
  END IF;

  SELECT *
  INTO v_claim
  FROM public.claim_calendar_revoke_outbox_v2(v_project_key, 1);

  IF v_claim.outbox_id IS DISTINCT FROM v_recovery_operation_id THEN
    RAISE EXCEPTION 'recovery outbox was not claimed';
  END IF;

  IF public.finalize_calendar_revoke_attempt_v2(
    v_project_key,
    v_claim.outbox_id,
    v_claim.lease_id,
    'confirmed'
  ) <> 'revoke_guarded' THEN
    RAISE EXCEPTION 'confirmed revoke skipped its propagation guard';
  END IF;

  UPDATE private.calendar_revoke_operations AS operation
  SET guard_until = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE operation.operation_id = v_recovery_operation_id;

  PERFORM private.finalize_calendar_revoke_guards_internal_v1(10);

  v_result := public.save_calendar_connection_command_v2(
    v_attempt_stale.attempt_id,
    v_project_key,
    v_user_id,
    'google',
    'google-subject-1',
    'subject-1@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.stale-ciphertext'
  );

  IF v_result <> 'enqueued' THEN
    RAISE EXCEPTION 'same-sub stale callback was activated: %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id = v_stale_save_operation_id
  ) THEN
    RAISE EXCEPTION 'stale callback token was not retained for revoke';
  END IF;

  -- Finish the stale callback revoke so a fresh callback can become active.
  SELECT *
  INTO v_claim
  FROM public.claim_calendar_revoke_outbox_v2(v_project_key, 1);

  PERFORM public.finalize_calendar_revoke_attempt_v2(
    v_project_key,
    v_claim.outbox_id,
    v_claim.lease_id,
    'confirmed'
  );

  UPDATE private.calendar_revoke_operations AS operation
  SET guard_until = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE operation.operation_id = v_stale_save_operation_id;

  PERFORM private.finalize_calendar_revoke_guards_internal_v1(10);

  SELECT *
  INTO v_attempt_b
  FROM public.begin_calendar_oauth_attempt_v1(
    v_project_key,
    v_user_id,
    pg_catalog.sha256(pg_catalog.convert_to('state-b', 'UTF8')),
    pg_catalog.sha256(pg_catalog.convert_to('verifier-b', 'UTF8'))
  );

  PERFORM 1
  FROM public.claim_calendar_oauth_attempt_v1(
    v_project_key,
    v_user_id,
    pg_catalog.sha256(pg_catalog.convert_to('state-b', 'UTF8')),
    pg_catalog.sha256(pg_catalog.convert_to('verifier-b', 'UTF8'))
  );

  IF public.save_calendar_connection_command_v2(
    v_attempt_b.attempt_id,
    v_project_key,
    v_user_id,
    'google',
    'google-subject-1',
    'subject-1@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.ciphertext-b'
  ) <> 'saved' THEN
    RAISE EXCEPTION 'fresh callback did not save';
  END IF;

  -- Immutable success receipts prevent A -> B -> replay A from restoring A.
  IF public.save_calendar_connection_command_v2(
    v_attempt_a.attempt_id,
    v_project_key,
    v_user_id,
    'google',
    'google-subject-1',
    'subject-1@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.ciphertext-a'
  ) <> 'saved' THEN
    RAISE EXCEPTION 'old successful save did not replay';
  END IF;

  SELECT
    connection.id,
    connection.authority_fence_id,
    connection.authority_epoch,
    connection.data_generation
  INTO v_connection
  FROM public.calendar_connections AS connection
  WHERE connection.user_id = v_user_id
    AND connection.provider_account_id = 'google-subject-1';

  IF (
    SELECT connection.refresh_token_enc
    FROM public.calendar_connections AS connection
    WHERE connection.id = v_connection.id
  ) <> 'v1.ciphertext-b' THEN
    RAISE EXCEPTION 'old save replay overwrote the current ciphertext';
  END IF;

  -- Rotation success receipts provide the same A -> B -> replay A guarantee.
  IF public.rotate_or_enqueue_calendar_refresh_token_command_v3(
    v_rotation_a,
    v_project_key,
    v_user_id,
    v_connection.id,
    v_connection.data_generation,
    v_connection.authority_fence_id,
    v_connection.authority_epoch,
    'v1.ciphertext-b',
    'v1.ciphertext-c'
  ) <> 'updated' THEN
    RAISE EXCEPTION 'rotation A failed';
  END IF;

  IF public.rotate_or_enqueue_calendar_refresh_token_command_v3(
    v_rotation_b,
    v_project_key,
    v_user_id,
    v_connection.id,
    v_connection.data_generation,
    v_connection.authority_fence_id,
    v_connection.authority_epoch,
    'v1.ciphertext-c',
    'v1.ciphertext-d'
  ) <> 'updated' THEN
    RAISE EXCEPTION 'rotation B failed';
  END IF;

  IF public.rotate_or_enqueue_calendar_refresh_token_command_v3(
    v_rotation_a,
    v_project_key,
    v_user_id,
    v_connection.id,
    v_connection.data_generation,
    v_connection.authority_fence_id,
    v_connection.authority_epoch,
    'v1.ciphertext-b',
    'v1.ciphertext-c'
  ) <> 'updated' THEN
    RAISE EXCEPTION 'rotation A did not replay';
  END IF;

  IF (
    SELECT connection.refresh_token_enc
    FROM public.calendar_connections AS connection
    WHERE connection.id = v_connection.id
  ) <> 'v1.ciphertext-d' THEN
    RAISE EXCEPTION 'old rotation replay overwrote the current ciphertext';
  END IF;

  -- A no-ciphertext recovery is leased before the direct provider call and an
  -- unconfirmed result retains a provider-finality guard without an outbox row.
  IF public.prepare_calendar_token_rotation_recovery_command_v2(
    v_direct_operation_id,
    v_project_key,
    v_user_id,
    v_connection.id,
    v_connection.data_generation,
    v_connection.authority_fence_id,
    v_connection.authority_epoch,
    'v1.ciphertext-d',
    NULL,
    NULL
  ) <> 'marked' THEN
    RAISE EXCEPTION 'direct recovery was not prepared';
  END IF;

  SELECT *
  INTO v_claim
  FROM public.claim_calendar_revoke_direct_attempt_v1(
    v_project_key,
    v_direct_operation_id,
    v_user_id
  );

  IF v_claim.lease_id IS NULL THEN
    RAISE EXCEPTION 'direct recovery was not leased';
  END IF;

  IF public.finalize_calendar_revoke_attempt_v2(
    v_project_key,
    v_direct_operation_id,
    v_claim.lease_id,
    'unconfirmed'
  ) <> 'expiry_guarded' THEN
    RAISE EXCEPTION 'unconfirmed direct revoke opened the fence';
  END IF;

  UPDATE private.calendar_revoke_operations AS operation
  SET guard_until = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE operation.operation_id = v_direct_operation_id;

  PERFORM private.finalize_calendar_revoke_guards_internal_v1(10);

  -- Hard expiry deletes ciphertext under an active lease but exact confirmed
  -- finalization still transitions through the propagation guard.
  IF public.prepare_calendar_token_rotation_recovery_command_v2(
    v_expiry_operation_id,
    v_project_key,
    v_user_id,
    v_connection.id,
    v_connection.data_generation,
    v_connection.authority_fence_id,
    v_connection.authority_epoch,
    'v1.ciphertext-d',
    'v1.expiring-ciphertext',
    NULL
  ) <> 'marked' THEN
    RAISE EXCEPTION 'expiry recovery was not prepared';
  END IF;

  SELECT *
  INTO v_claim
  FROM public.claim_calendar_revoke_outbox_v2(v_project_key, 1);

  UPDATE private.calendar_revoke_operations AS operation
  SET created_at = pg_catalog.clock_timestamp() - INTERVAL '1 hour',
      expires_at = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE operation.operation_id = v_expiry_operation_id;

  UPDATE private.calendar_revoke_outbox AS queued
  SET created_at = pg_catalog.clock_timestamp() - INTERVAL '1 hour',
      expires_at = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE queued.id = v_expiry_operation_id;

  PERFORM private.expire_calendar_revoke_authority_internal_v2(10);

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id = v_expiry_operation_id
  ) OR (
    SELECT operation.state
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.operation_id = v_expiry_operation_id
  ) <> 'expiry_guarded' THEN
    RAISE EXCEPTION 'active-lease hard expiry did not retain only the guard';
  END IF;

  IF public.finalize_calendar_revoke_attempt_v2(
    v_project_key,
    v_expiry_operation_id,
    v_claim.lease_id,
    'confirmed'
  ) <> 'revoke_guarded' THEN
    RAISE EXCEPTION 'exact lease could not confirm after hard expiry';
  END IF;

  -- Account deletion snapshots both a current connection and an outbox-only
  -- token left by disconnect. A direct auth delete must fail before every
  -- ciphertext has a durable provider-attempt outcome.
  -- This rollback-only smoke exercises several application transactions in
  -- one DO block, so release the test-only writer binding before switching
  -- fixture users. Production requests never delete this transaction state.
  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  v_delete_subject_fence_id :=
    private.get_or_create_calendar_subject_fence_v1(
      v_project_key,
      'google-delete-subject-1'
    );

  SELECT fence.epoch
  INTO v_delete_subject_epoch
  FROM private.calendar_authority_fences AS fence
  WHERE fence.id = v_delete_subject_fence_id;

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
    v_delete_connection_id,
    v_delete_user_id,
    'google',
    'google-delete-subject-1',
    'delete-subject-1@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.delete-outbox-ciphertext',
    'active',
    0,
    v_delete_subject_fence_id,
    v_delete_subject_epoch
  );

  IF public.disconnect_calendar_connection_command_v1(
    v_disconnect_operation_id,
    v_project_key,
    v_delete_user_id,
    v_delete_connection_id
  ) <> 'queued' THEN
    RAISE EXCEPTION 'delete fixture disconnect did not enqueue';
  END IF;

  v_delete_subject_fence_id :=
    private.get_or_create_calendar_subject_fence_v1(
      v_project_key,
      'google-delete-subject-2'
    );

  SELECT fence.epoch
  INTO v_delete_subject_epoch
  FROM private.calendar_authority_fences AS fence
  WHERE fence.id = v_delete_subject_fence_id;

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
    v_delete_current_connection_id,
    v_delete_user_id,
    'google',
    'google-delete-subject-2',
    'delete-subject-2@example.com',
    ARRAY['calendar.readonly']::TEXT[],
    'v1.delete-current-ciphertext',
    'active',
    0,
    v_delete_subject_fence_id,
    v_delete_subject_epoch
  );

  BEGIN
    DELETE FROM auth.users AS auth_user
    WHERE auth_user.id = v_delete_user_id;
    RAISE EXCEPTION 'account deletion bypassed Calendar preparation';
  EXCEPTION
    WHEN SQLSTATE 'CA019' THEN
      NULL;
  END;

  -- Model the next HTTP request, which starts with a fresh transaction and can
  -- take the exclusive account-deletion user lock.
  DELETE FROM private.timeblock_transaction_states AS state
  WHERE state.backend_pid = pg_catalog.pg_backend_pid()
    AND state.transaction_id = pg_catalog.pg_current_xact_id();

  FOR v_delete_item IN
    SELECT *
    FROM public.begin_calendar_account_deletion_v1(
      v_deletion_id,
      v_project_key,
      v_delete_user_id
    )
    WHERE item_kind IN ('connection', 'outbox')
    ORDER BY item_kind, item_id
  LOOP
    SELECT *
    INTO v_delete_prepare
    FROM public.prepare_calendar_account_delete_revoke_v1(
      v_deletion_id,
      gen_random_uuid(),
      v_project_key,
      v_delete_user_id,
      v_delete_item.item_kind,
      v_delete_item.item_id
    );

    IF v_delete_prepare.result <> 'prepared'
      OR v_delete_prepare.refresh_token_enc IS NULL
      OR v_delete_prepare.lease_id IS NULL THEN
      RAISE EXCEPTION 'account deletion item was not prepared: %', v_delete_prepare.result;
    END IF;

    IF NOT v_not_started_tested THEN
      IF public.finalize_calendar_account_delete_revoke_v1(
        v_deletion_id,
        v_project_key,
        v_delete_user_id,
        v_delete_prepare.operation_id,
        v_delete_prepare.lease_id,
        'not_started'
      ) <> 'retried' THEN
        RAISE EXCEPTION 'not-started account revoke became terminal';
      END IF;

      BEGIN
        PERFORM public.seal_calendar_account_deletion_v1(
          v_deletion_id,
          v_project_key,
          v_delete_user_id
        );
        RAISE EXCEPTION 'not-started account revoke satisfied the seal';
      EXCEPTION
        WHEN SQLSTATE 'CA019' THEN
          NULL;
      END;

      SELECT *
      INTO v_delete_prepare
      FROM public.prepare_calendar_account_delete_revoke_v1(
        v_deletion_id,
        gen_random_uuid(),
        v_project_key,
        v_delete_user_id,
        v_delete_item.item_kind,
        v_delete_item.item_id
      );
      v_not_started_tested := TRUE;
    END IF;

    IF (
      SELECT operation.active_lease_id
      FROM private.calendar_revoke_operations AS operation
      WHERE operation.operation_id = v_delete_prepare.operation_id
    ) IS DISTINCT FROM v_delete_prepare.lease_id THEN
      RAISE EXCEPTION 'prepared lease does not match operation: % / %',
        v_delete_prepare.lease_id,
        (
          SELECT operation.active_lease_id
          FROM private.calendar_revoke_operations AS operation
          WHERE operation.operation_id = v_delete_prepare.operation_id
        );
    END IF;

    v_result := public.start_calendar_account_delete_provider_attempt_v1(
      v_deletion_id,
      v_project_key,
      v_delete_user_id,
      v_delete_prepare.operation_id,
      v_delete_prepare.lease_id
    );

    IF v_result <> 'started' THEN
      RAISE EXCEPTION 'account deletion provider dispatch was not recorded: %', v_result;
    END IF;

    v_result := public.finalize_calendar_account_delete_revoke_v1(
      v_deletion_id,
      v_project_key,
      v_delete_user_id,
      v_delete_prepare.operation_id,
      v_delete_prepare.lease_id,
      CASE
        WHEN v_delete_item.item_kind = 'connection' THEN 'confirmed'
        ELSE 'unconfirmed'
      END
    );

    IF v_result NOT IN ('revoke_guarded', 'expiry_guarded') THEN
      RAISE EXCEPTION 'account deletion provider outcome was not guarded: %', v_result;
    END IF;
  END LOOP;

  IF NOT public.seal_calendar_account_deletion_v1(
    v_deletion_id,
    v_project_key,
    v_delete_user_id
  ) THEN
    RAISE EXCEPTION 'account deletion was not sealed';
  END IF;

  DELETE FROM auth.users AS auth_user
  WHERE auth_user.id = v_delete_user_id;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.user_id = v_delete_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = v_delete_user_id
  ) OR EXISTS (
    SELECT 1
    FROM private.calendar_revoke_operations AS operation
    WHERE operation.account_deletion_id = v_deletion_id
      AND (
        operation.source_user_id IS NOT NULL
        OR operation.provider_attempt_outcome NOT IN (
          'confirmed',
          'unconfirmed'
        )
      )
  ) THEN
    RAISE EXCEPTION 'account deletion retained ciphertext or incomplete receipts';
  END IF;
END;
$$;

SELECT pass('Calendar authority operations preserve generation and fence invariants');
SELECT * FROM finish();

ROLLBACK;
