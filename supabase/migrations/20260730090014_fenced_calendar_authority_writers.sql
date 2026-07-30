-- Draft: fence-aware OAuth save, refresh-token rotation/recovery, reauth, and
-- account-preserving purge commands.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.save_calendar_connection_command_v2(
  p_attempt_id UUID,
  p_project_key TEXT,
  p_user_id UUID,
  p_provider TEXT,
  p_provider_account_id TEXT,
  p_provider_account_email TEXT,
  p_granted_scopes TEXT[],
  p_refresh_token_enc TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_attempt private.calendar_oauth_attempts%ROWTYPE;
  v_current_generation BIGINT;
  v_project_fence_id UUID;
  v_project_epoch BIGINT;
  v_quarantine_state TEXT;
  v_quarantine_ready_after_project_epoch BIGINT;
  v_subject_fence_id UUID;
  v_subject_epoch BIGINT;
  v_subject_state TEXT;
  v_subject_ready_after_project_epoch BIGINT;
  v_resource_connection_id UUID;
  v_existing_receipt private.calendar_authority_command_receipts%ROWTYPE;
  v_existing_operation private.calendar_revoke_operations%ROWTYPE;
  v_begin RECORD;
  v_request_digest BYTEA;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_attempt_id IS NULL
    OR p_user_id IS NULL
    OR p_provider IS DISTINCT FROM 'google'
    OR NULLIF(pg_catalog.btrim(p_provider_account_id), '') IS NULL
    OR p_provider_account_id IS DISTINCT FROM pg_catalog.btrim(p_provider_account_id)
    OR pg_catalog.length(p_provider_account_id) > 255
    OR NULLIF(pg_catalog.btrim(p_refresh_token_enc), '') IS NULL
    OR COALESCE(pg_catalog.cardinality(p_granted_scopes), 0) = 0
    OR pg_catalog.array_position(p_granted_scopes, NULL::TEXT) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid Calendar connection input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_calendar_account_not_deleting_v1(p_user_id);
  v_current_generation := private.get_user_data_generation_v1(p_user_id);

  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  SELECT project.epoch
  INTO v_project_epoch
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT attempt.*
  INTO v_attempt
  FROM private.calendar_oauth_attempts AS attempt
  WHERE attempt.id = p_attempt_id
    AND attempt.project_fence_id = v_project_fence_id
    AND attempt.user_id = p_user_id
    AND attempt.claimed_at IS NOT NULL
    AND (
      attempt.completed_at IS NOT NULL
      OR (
        attempt.expires_at > v_now
        AND attempt.claim_expires_at > v_now
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar OAuth attempt is unavailable'
      USING ERRCODE = 'CA016';
  END IF;

  IF v_attempt.project_epoch > v_project_epoch THEN
    RAISE EXCEPTION 'Calendar OAuth project epoch is invalid'
      USING ERRCODE = 'CA012';
  END IF;

  v_request_digest := private.digest_calendar_authority_operation_v1(
    'connection_save',
    pg_catalog.jsonb_build_object(
      'operationId', v_attempt.operation_id,
      'connectionId', v_attempt.connection_id,
      'projectKey', p_project_key,
      'userId', p_user_id,
      'expectedGeneration', v_attempt.data_generation,
      'expectedProjectEpoch', v_attempt.project_epoch,
      'provider', p_provider,
      'providerAccountId', p_provider_account_id,
      'providerAccountEmail', p_provider_account_email,
      'grantedScopes', p_granted_scopes,
      'refreshTokenCiphertext', p_refresh_token_enc
    )
  );

  SELECT
    quarantine.state,
    quarantine.ready_after_project_epoch
  INTO
    v_quarantine_state,
    v_quarantine_ready_after_project_epoch
  FROM private.calendar_authority_fences AS quarantine
  WHERE quarantine.project_key = p_project_key
    AND quarantine.scope_kind = 'quarantine'
  FOR UPDATE;

  v_subject_fence_id :=
    private.get_or_create_calendar_subject_fence_v1(
      p_project_key,
      p_provider_account_id
    );

  SELECT
    subject.epoch,
    subject.state,
    subject.ready_after_project_epoch
  INTO
    v_subject_epoch,
    v_subject_state,
    v_subject_ready_after_project_epoch
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_subject_fence_id
  FOR UPDATE;

  SELECT receipt.*
  INTO v_existing_receipt
  FROM private.calendar_authority_command_receipts AS receipt
  WHERE receipt.operation_id = v_attempt.operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_receipt.command_kind IS DISTINCT FROM 'connection_save'
      OR v_existing_receipt.project_fence_id IS DISTINCT FROM v_project_fence_id
      OR v_existing_receipt.subject_fence_id IS DISTINCT FROM v_subject_fence_id
      OR v_existing_receipt.source_user_id IS DISTINCT FROM p_user_id
      OR v_existing_receipt.source_connection_id IS DISTINCT FROM v_attempt.connection_id
      OR v_existing_receipt.request_digest IS DISTINCT FROM v_request_digest
      OR v_existing_receipt.result IS DISTINCT FROM 'saved' THEN
      RAISE EXCEPTION 'Calendar authority operation was reused'
        USING ERRCODE = 'CA004';
    END IF;

    RETURN 'saved';
  END IF;

  SELECT operation.*
  INTO v_existing_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = v_attempt.operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_operation.project_fence_id IS DISTINCT FROM v_project_fence_id
      OR v_existing_operation.subject_fence_id IS DISTINCT FROM v_subject_fence_id
      OR v_existing_operation.source_user_id IS DISTINCT FROM p_user_id
      OR v_existing_operation.source_connection_id IS DISTINCT FROM v_attempt.connection_id
      OR v_existing_operation.operation_kind IS DISTINCT FROM 'connection_save'
      OR v_existing_operation.request_digest IS DISTINCT FROM v_request_digest THEN
      RAISE EXCEPTION 'Calendar authority operation was reused'
        USING ERRCODE = 'CA004';
    END IF;

    RETURN 'enqueued';
  END IF;

  IF v_attempt.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Calendar OAuth attempt completion invariant failed'
      USING ERRCODE = 'CA012';
  END IF;

  IF v_current_generation IS DISTINCT FROM v_attempt.data_generation
    OR v_subject_state IS DISTINCT FROM 'ready'
    OR v_quarantine_state IS DISTINCT FROM 'ready'
    OR v_attempt.project_epoch < v_subject_ready_after_project_epoch
    OR v_attempt.project_epoch < v_quarantine_ready_after_project_epoch THEN
    SELECT *
    INTO v_begin
    FROM private.begin_calendar_revoke_operation_v1(
      v_attempt.operation_id,
      v_project_fence_id,
      v_subject_fence_id,
      p_user_id,
      v_attempt.connection_id,
      'connection_save',
      v_request_digest,
      'enqueued',
      v_now + INTERVAL '23 hours 59 minutes'
    );

    IF NOT v_begin.replayed THEN
      INSERT INTO private.calendar_revoke_outbox (
        id,
        user_id,
        source_connection_id,
        provider,
        refresh_token_enc,
        created_at,
        expires_at,
        authority_fence_id,
        authority_epoch
      ) VALUES (
        v_attempt.operation_id,
        p_user_id,
        v_attempt.connection_id,
        p_provider,
        p_refresh_token_enc,
        v_now,
        v_now + INTERVAL '23 hours 59 minutes',
        v_subject_fence_id,
        v_begin.operation_subject_epoch
      );
    END IF;

    UPDATE private.calendar_oauth_attempts AS attempt
    SET completed_at = v_now,
        result = 'enqueued'
    WHERE attempt.id = v_attempt.id;

    RETURN 'enqueued';
  END IF;

  INSERT INTO public.calendar_connections (
    id,
    user_id,
    provider,
    provider_account_id,
    provider_account_email,
    granted_scopes,
    refresh_token_enc,
    status,
    last_sync_error,
    data_generation,
    authority_fence_id,
    authority_epoch,
    refresh_token_rotation_operation_id
  ) VALUES (
    v_attempt.connection_id,
    p_user_id,
    p_provider,
    p_provider_account_id,
    p_provider_account_email,
    p_granted_scopes,
    p_refresh_token_enc,
    'active',
    NULL,
    v_current_generation,
    v_subject_fence_id,
    v_subject_epoch,
    NULL
  )
  ON CONFLICT (user_id, provider, provider_account_id) DO UPDATE
  SET provider_account_email = EXCLUDED.provider_account_email,
      granted_scopes = EXCLUDED.granted_scopes,
      refresh_token_enc = EXCLUDED.refresh_token_enc,
      status = 'active',
      last_sync_error = NULL,
      data_generation = EXCLUDED.data_generation,
      authority_fence_id = EXCLUDED.authority_fence_id,
      authority_epoch = EXCLUDED.authority_epoch,
      sync_sequence = calendar_connections.sync_sequence + 1,
      refresh_token_rotation_operation_id = NULL
  RETURNING id INTO v_resource_connection_id;

  INSERT INTO private.calendar_authority_command_receipts (
    operation_id,
    command_kind,
    project_fence_id,
    subject_fence_id,
    source_user_id,
    source_connection_id,
    resource_connection_id,
    request_digest,
    result,
    created_at,
    delete_after
  ) VALUES (
    v_attempt.operation_id,
    'connection_save',
    v_project_fence_id,
    v_subject_fence_id,
    p_user_id,
    v_attempt.connection_id,
    v_resource_connection_id,
    v_request_digest,
    'saved',
    v_now,
    v_now + INTERVAL '90 days'
  );

  UPDATE private.calendar_oauth_attempts AS attempt
  SET completed_at = v_now,
      result = 'saved'
  WHERE attempt.id = v_attempt.id;

  RETURN 'saved';
END;
$$;

REVOKE ALL ON FUNCTION public.save_calendar_connection_command_v2(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT[], TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_calendar_connection_command_v2(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT[], TEXT
) TO service_role;

COMMENT ON FUNCTION public.save_calendar_connection_command_v2(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT[], TEXT
) IS
  'Consumes one trusted OAuth attempt and immutably records either a generation/watermark-bound save or a stale-token revoke; service role only.';

CREATE FUNCTION public.prepare_calendar_token_rotation_recovery_command_v2(
  p_operation_id UUID,
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_authority_fence_id UUID,
  p_expected_authority_epoch BIGINT,
  p_expected_refresh_token_enc TEXT,
  p_new_refresh_token_enc TEXT DEFAULT NULL,
  p_last_synced_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TEXT
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
  v_initial_result TEXT;
  v_request_digest BYTEA;
  v_begin RECORD;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_user_id IS NULL
    OR p_connection_id IS NULL
    OR p_expected_generation IS NULL
    OR p_expected_generation < 0
    OR p_expected_authority_fence_id IS NULL
    OR p_expected_authority_epoch IS NULL
    OR p_expected_authority_epoch < 0
    OR NULLIF(pg_catalog.btrim(p_expected_refresh_token_enc), '') IS NULL
    OR (
      p_new_refresh_token_enc IS NOT NULL
      AND NULLIF(pg_catalog.btrim(p_new_refresh_token_enc), '') IS NULL
    ) THEN
    RAISE EXCEPTION 'Invalid Calendar token recovery input'
      USING ERRCODE = '22023';
  END IF;

  v_request_digest := private.digest_calendar_authority_operation_v1(
    'token_rotation_recovery',
    pg_catalog.jsonb_build_object(
      'operationId', p_operation_id,
      'projectKey', p_project_key,
      'userId', p_user_id,
      'connectionId', p_connection_id,
      'expectedGeneration', p_expected_generation,
      'expectedAuthorityFenceId', p_expected_authority_fence_id,
      'expectedAuthorityEpoch', p_expected_authority_epoch,
      'expectedRefreshTokenCiphertext', p_expected_refresh_token_enc,
      'newRefreshTokenCiphertext', p_new_refresh_token_enc,
      'lastSyncedAt', p_last_synced_at
    )
  );

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_calendar_account_not_deleting_v1(p_user_id);
  v_current_generation := private.get_user_data_generation_v1(p_user_id);

  IF v_current_generation < p_expected_generation THEN
    RAISE EXCEPTION 'Calendar token generation is invalid'
      USING ERRCODE = 'DG003';
  END IF;

  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_authority_fences AS fence
  WHERE fence.project_key = p_project_key
    AND fence.scope_kind = 'quarantine'
  FOR UPDATE;

  v_subject_fence_id := p_expected_authority_fence_id;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_subject_fence_id
    AND subject.project_key = p_project_key
    AND subject.scope_kind = 'subject'
    AND subject.epoch >= p_expected_authority_epoch
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar recovery authority fence is unavailable'
      USING ERRCODE = 'CA003';
  END IF;

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.calendar_connections AS connection
        WHERE connection.authority_fence_id = v_subject_fence_id
          AND connection.provider = 'google'
      ) THEN 'marked'
      ELSE 'missing'
    END
  INTO v_initial_result;

  SELECT *
  INTO v_begin
  FROM private.begin_calendar_revoke_operation_v1(
    p_operation_id,
    v_project_fence_id,
    v_subject_fence_id,
    p_user_id,
    p_connection_id,
    'token_rotation_recovery',
    v_request_digest,
    v_initial_result,
    v_now + INTERVAL '23 hours 59 minutes'
  );

  IF v_begin.replayed THEN
    IF v_begin.operation_state IN ('revoked', 'expired') THEN
      RETURN v_begin.operation_state;
    END IF;
    RETURN v_begin.operation_result;
  END IF;

  IF p_new_refresh_token_enc IS NOT NULL THEN
    INSERT INTO private.calendar_revoke_outbox (
      id,
      user_id,
      source_connection_id,
      provider,
      refresh_token_enc,
      created_at,
      expires_at,
      authority_fence_id,
      authority_epoch
    ) VALUES (
      p_operation_id,
      p_user_id,
      p_connection_id,
      'google',
      p_new_refresh_token_enc,
      v_now,
      v_now + INTERVAL '23 hours 59 minutes',
      v_subject_fence_id,
      v_begin.operation_subject_epoch
    );
  END IF;

  UPDATE public.calendar_connections AS connection
  SET last_synced_at = CASE
        WHEN p_last_synced_at IS NULL THEN connection.last_synced_at
        WHEN connection.last_synced_at IS NULL THEN p_last_synced_at
        ELSE GREATEST(connection.last_synced_at, p_last_synced_at)
      END
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  RETURN v_initial_result;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_calendar_token_rotation_recovery_command_v2(
  UUID, TEXT, UUID, UUID, BIGINT, UUID, BIGINT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_calendar_token_rotation_recovery_command_v2(
  UUID, TEXT, UUID, UUID, BIGINT, UUID, BIGINT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.prepare_calendar_token_rotation_recovery_command_v2(
  UUID, TEXT, UUID, UUID, BIGINT, UUID, BIGINT, TEXT, TEXT, TIMESTAMPTZ
) IS
  'Starts or replays a subject-scoped durable recovery fence before provider revocation; service role only.';

CREATE FUNCTION public.rotate_or_enqueue_calendar_refresh_token_command_v3(
  p_operation_id UUID,
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_authority_fence_id UUID,
  p_expected_authority_epoch BIGINT,
  p_expected_refresh_token_enc TEXT,
  p_new_refresh_token_enc TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_current_generation BIGINT;
  v_project_fence_id UUID;
  v_quarantine_state TEXT;
  v_subject_fence_id UUID;
  v_subject_epoch BIGINT;
  v_subject_state TEXT;
  v_connection RECORD;
  v_existing_receipt private.calendar_authority_command_receipts%ROWTYPE;
  v_existing_operation private.calendar_revoke_operations%ROWTYPE;
  v_begin RECORD;
  v_request_digest BYTEA;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_user_id IS NULL
    OR p_connection_id IS NULL
    OR p_expected_generation IS NULL
    OR p_expected_generation < 0
    OR p_expected_authority_fence_id IS NULL
    OR p_expected_authority_epoch IS NULL
    OR p_expected_authority_epoch < 0
    OR NULLIF(pg_catalog.btrim(p_expected_refresh_token_enc), '') IS NULL
    OR NULLIF(pg_catalog.btrim(p_new_refresh_token_enc), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar token rotation input'
      USING ERRCODE = '22023';
  END IF;

  v_request_digest := private.digest_calendar_authority_operation_v1(
    'token_rotation',
    pg_catalog.jsonb_build_object(
      'operationId', p_operation_id,
      'projectKey', p_project_key,
      'userId', p_user_id,
      'connectionId', p_connection_id,
      'expectedGeneration', p_expected_generation,
      'expectedAuthorityFenceId', p_expected_authority_fence_id,
      'expectedAuthorityEpoch', p_expected_authority_epoch,
      'expectedRefreshTokenCiphertext', p_expected_refresh_token_enc,
      'newRefreshTokenCiphertext', p_new_refresh_token_enc
    )
  );

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_calendar_account_not_deleting_v1(p_user_id);
  v_current_generation := private.get_user_data_generation_v1(p_user_id);

  IF v_current_generation < p_expected_generation THEN
    RAISE EXCEPTION 'Calendar token generation is invalid'
      USING ERRCODE = 'DG003';
  END IF;

  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT
    quarantine.state
  INTO
    v_quarantine_state
  FROM private.calendar_authority_fences AS quarantine
  WHERE quarantine.project_key = p_project_key
    AND quarantine.scope_kind = 'quarantine'
  FOR UPDATE;

  SELECT
    connection.authority_fence_id,
    connection.data_generation,
    connection.provider,
    connection.refresh_token_enc,
    connection.refresh_token_rotation_operation_id,
    connection.authority_epoch,
    connection.status
  INTO v_connection
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  v_subject_fence_id := p_expected_authority_fence_id;

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
    RAISE EXCEPTION 'Calendar connection authority fence is unavailable'
      USING ERRCODE = 'CA003';
  END IF;

  SELECT receipt.*
  INTO v_existing_receipt
  FROM private.calendar_authority_command_receipts AS receipt
  WHERE receipt.operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_receipt.command_kind IS DISTINCT FROM 'token_rotation'
      OR v_existing_receipt.project_fence_id IS DISTINCT FROM v_project_fence_id
      OR v_existing_receipt.subject_fence_id IS DISTINCT FROM v_subject_fence_id
      OR v_existing_receipt.source_user_id IS DISTINCT FROM p_user_id
      OR v_existing_receipt.source_connection_id IS DISTINCT FROM p_connection_id
      OR v_existing_receipt.resource_connection_id IS DISTINCT FROM p_connection_id
      OR v_existing_receipt.request_digest IS DISTINCT FROM v_request_digest
      OR v_existing_receipt.result IS DISTINCT FROM 'updated' THEN
      RAISE EXCEPTION 'Calendar authority operation was reused'
        USING ERRCODE = 'CA004';
    END IF;

    RETURN 'updated';
  END IF;

  SELECT operation.*
  INTO v_existing_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_operation.project_fence_id IS DISTINCT FROM v_project_fence_id
      OR v_existing_operation.subject_fence_id IS DISTINCT FROM v_subject_fence_id
      OR v_existing_operation.source_user_id IS DISTINCT FROM p_user_id
      OR v_existing_operation.source_connection_id IS DISTINCT FROM p_connection_id
      OR v_existing_operation.operation_kind IS DISTINCT FROM 'token_rotation'
      OR v_existing_operation.request_digest IS DISTINCT FROM v_request_digest THEN
      RAISE EXCEPTION 'Calendar authority operation was reused'
        USING ERRCODE = 'CA004';
    END IF;

    RETURN 'enqueued';
  END IF;

  IF v_current_generation > p_expected_generation
    OR v_subject_state IS DISTINCT FROM 'ready'
    OR v_quarantine_state IS DISTINCT FROM 'ready'
    OR v_connection.status IS DISTINCT FROM 'active'
    OR v_connection.authority_fence_id IS DISTINCT FROM p_expected_authority_fence_id
    OR v_connection.authority_epoch IS DISTINCT FROM p_expected_authority_epoch
    OR v_subject_epoch IS DISTINCT FROM p_expected_authority_epoch THEN
    SELECT *
    INTO v_begin
    FROM private.begin_calendar_revoke_operation_v1(
      p_operation_id,
      v_project_fence_id,
      v_subject_fence_id,
      p_user_id,
      p_connection_id,
      'token_rotation',
      v_request_digest,
      'enqueued',
      v_now + INTERVAL '23 hours 59 minutes'
    );

    IF NOT v_begin.replayed THEN
      INSERT INTO private.calendar_revoke_outbox (
        id,
        user_id,
        source_connection_id,
        provider,
        refresh_token_enc,
        created_at,
        expires_at,
        authority_fence_id,
        authority_epoch
      ) VALUES (
        p_operation_id,
        p_user_id,
        p_connection_id,
        'google',
        p_new_refresh_token_enc,
        v_now,
        v_now + INTERVAL '23 hours 59 minutes',
        v_subject_fence_id,
        v_begin.operation_subject_epoch
      );
    END IF;

    RETURN 'enqueued';
  END IF;

  SELECT
    connection.data_generation,
    connection.provider,
    connection.refresh_token_enc,
    connection.refresh_token_rotation_operation_id,
    connection.authority_fence_id,
    connection.authority_epoch,
    connection.status
  INTO v_connection
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar connection is unavailable'
      USING ERRCODE = 'CA001';
  END IF;

  IF v_connection.data_generation IS DISTINCT FROM p_expected_generation
    OR v_connection.provider IS DISTINCT FROM 'google'
    OR v_connection.status IS DISTINCT FROM 'active'
    OR v_connection.authority_fence_id IS DISTINCT FROM v_subject_fence_id
    OR v_connection.authority_epoch IS DISTINCT FROM p_expected_authority_epoch THEN
    RAISE EXCEPTION 'Calendar connection authority invariant failed'
      USING ERRCODE = 'CA003';
  END IF;

  IF v_connection.refresh_token_enc IS NOT DISTINCT FROM p_new_refresh_token_enc THEN
    IF v_connection.refresh_token_rotation_operation_id IS DISTINCT FROM p_operation_id THEN
      RAISE EXCEPTION 'Calendar token rotation operation was reused'
        USING ERRCODE = 'CA004';
    END IF;
    INSERT INTO private.calendar_authority_command_receipts (
      operation_id,
      command_kind,
      project_fence_id,
      subject_fence_id,
      source_user_id,
      source_connection_id,
      resource_connection_id,
      request_digest,
      result,
      created_at,
      delete_after
    ) VALUES (
      p_operation_id,
      'token_rotation',
      v_project_fence_id,
      v_subject_fence_id,
      p_user_id,
      p_connection_id,
      p_connection_id,
      v_request_digest,
      'updated',
      v_now,
      v_now + INTERVAL '90 days'
    );

    RETURN 'updated';
  END IF;

  IF v_connection.refresh_token_enc IS DISTINCT FROM p_expected_refresh_token_enc THEN
    RAISE EXCEPTION 'Calendar refresh token changed concurrently'
      USING ERRCODE = 'CA002';
  END IF;

  UPDATE public.calendar_connections AS connection
  SET refresh_token_enc = p_new_refresh_token_enc,
      refresh_token_rotation_operation_id = p_operation_id
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  INSERT INTO private.calendar_authority_command_receipts (
    operation_id,
    command_kind,
    project_fence_id,
    subject_fence_id,
    source_user_id,
    source_connection_id,
    resource_connection_id,
    request_digest,
    result,
    created_at,
    delete_after
  ) VALUES (
    p_operation_id,
    'token_rotation',
    v_project_fence_id,
    v_subject_fence_id,
    p_user_id,
    p_connection_id,
    p_connection_id,
    v_request_digest,
    'updated',
    v_now,
    v_now + INTERVAL '90 days'
  );

  RETURN 'updated';
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_or_enqueue_calendar_refresh_token_command_v3(
  UUID, TEXT, UUID, UUID, BIGINT, UUID, BIGINT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_or_enqueue_calendar_refresh_token_command_v3(
  UUID, TEXT, UUID, UUID, BIGINT, UUID, BIGINT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.rotate_or_enqueue_calendar_refresh_token_command_v3(
  UUID, TEXT, UUID, UUID, BIGINT, UUID, BIGINT, TEXT, TEXT
) IS
  'CAS-updates a ready subject-bound Calendar token or durably enqueues it after generation/fence loss; service role only.';

CREATE FUNCTION public.mark_calendar_connection_reauth_command_v3(
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_authority_fence_id UUID,
  p_expected_authority_epoch BIGINT,
  p_expected_refresh_token_enc TEXT,
  p_operation_id UUID DEFAULT NULL,
  p_new_refresh_token_enc TEXT DEFAULT NULL,
  p_last_synced_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TEXT
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
  v_connection RECORD;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL
    OR p_connection_id IS NULL
    OR p_expected_generation IS NULL
    OR p_expected_generation < 0
    OR p_expected_authority_fence_id IS NULL
    OR p_expected_authority_epoch IS NULL
    OR p_expected_authority_epoch < 0
    OR NULLIF(pg_catalog.btrim(p_expected_refresh_token_enc), '') IS NULL
    OR (p_operation_id IS NULL) IS DISTINCT FROM (p_new_refresh_token_enc IS NULL)
    OR (
      p_new_refresh_token_enc IS NOT NULL
      AND NULLIF(pg_catalog.btrim(p_new_refresh_token_enc), '') IS NULL
    ) THEN
    RAISE EXCEPTION 'Invalid Calendar reauthorization input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_calendar_account_not_deleting_v1(p_user_id);
  v_current_generation := private.get_user_data_generation_v1(p_user_id);

  IF v_current_generation > p_expected_generation THEN
    RETURN 'missing';
  END IF;

  IF v_current_generation < p_expected_generation THEN
    RAISE EXCEPTION 'Calendar token generation is invalid'
      USING ERRCODE = 'DG003';
  END IF;

  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  v_subject_fence_id := p_expected_authority_fence_id;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_subject_fence_id
    AND subject.project_key = p_project_key
    AND subject.scope_kind = 'subject'
  FOR UPDATE;

  SELECT
    connection.data_generation,
    connection.provider,
    connection.refresh_token_enc,
    connection.refresh_token_rotation_operation_id,
    connection.authority_fence_id,
    connection.authority_epoch
  INTO v_connection
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_connection.data_generation IS DISTINCT FROM p_expected_generation
    OR v_connection.provider IS DISTINCT FROM 'google'
    OR v_connection.authority_fence_id IS DISTINCT FROM p_expected_authority_fence_id
    OR v_connection.authority_epoch IS DISTINCT FROM p_expected_authority_epoch THEN
    RAISE EXCEPTION 'Calendar connection authority invariant failed'
      USING ERRCODE = 'CA003';
  END IF;

  IF v_connection.refresh_token_enc IS DISTINCT FROM p_expected_refresh_token_enc
    AND NOT (
      p_operation_id IS NOT NULL
      AND v_connection.refresh_token_rotation_operation_id IS NOT DISTINCT FROM p_operation_id
      AND v_connection.refresh_token_enc IS NOT DISTINCT FROM p_new_refresh_token_enc
    ) THEN
    RETURN 'superseded';
  END IF;

  UPDATE public.calendar_connections AS connection
  SET status = 'reauth_required',
      last_sync_error = 'reauth_required',
      last_synced_at = CASE
        WHEN connection.id = p_connection_id
          THEN CASE
            WHEN p_last_synced_at IS NULL THEN connection.last_synced_at
            WHEN connection.last_synced_at IS NULL THEN p_last_synced_at
            ELSE GREATEST(connection.last_synced_at, p_last_synced_at)
          END
        ELSE connection.last_synced_at
      END
  WHERE connection.authority_fence_id = v_subject_fence_id;

  RETURN 'marked';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_calendar_connection_reauth_command_v3(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, TEXT, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_calendar_connection_reauth_command_v3(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, TEXT, UUID, TEXT, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.mark_calendar_connection_reauth_command_v3(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, TEXT, UUID, TEXT, TIMESTAMPTZ
) IS
  'Fail-closes every Dayopt connection sharing the exact Google subject after a generation/authority-bound invalid grant; service role only.';

CREATE FUNCTION public.disconnect_calendar_connection_command_v1(
  p_operation_id UUID,
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID
)
RETURNS TEXT
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
  v_connection RECORD;
  v_existing_operation private.calendar_revoke_operations%ROWTYPE;
  v_request_digest BYTEA;
  v_begin RECORD;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_user_id IS NULL
    OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar disconnect input'
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

  SELECT operation.*
  INTO v_existing_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_operation.project_fence_id IS DISTINCT FROM v_project_fence_id
      OR v_existing_operation.source_user_id IS DISTINCT FROM p_user_id
      OR v_existing_operation.source_connection_id IS DISTINCT FROM p_connection_id
      OR v_existing_operation.operation_kind IS DISTINCT FROM 'disconnect' THEN
      RAISE EXCEPTION 'Calendar authority operation was reused'
        USING ERRCODE = 'CA004';
    END IF;

    RETURN v_existing_operation.initial_result;
  END IF;

  SELECT connection.authority_fence_id
  INTO v_subject_fence_id
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_subject_fence_id
    AND subject.project_key = p_project_key
    AND subject.scope_kind = 'subject'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar disconnect authority fence is unavailable'
      USING ERRCODE = 'CA003';
  END IF;

  SELECT
    connection.data_generation,
    connection.provider,
    connection.provider_account_id,
    connection.refresh_token_enc,
    connection.authority_fence_id,
    connection.authority_epoch
  INTO v_connection
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_connection.data_generation IS DISTINCT FROM v_current_generation
    OR v_connection.provider IS DISTINCT FROM 'google'
    OR v_connection.authority_fence_id IS DISTINCT FROM v_subject_fence_id
    OR v_connection.authority_epoch IS NULL THEN
    RAISE EXCEPTION 'Calendar disconnect authority invariant failed'
      USING ERRCODE = 'CA003';
  END IF;

  v_request_digest := private.digest_calendar_authority_operation_v1(
    'disconnect',
    pg_catalog.jsonb_build_object(
      'operationId', p_operation_id,
      'projectKey', p_project_key,
      'userId', p_user_id,
      'connectionId', p_connection_id,
      'dataGeneration', v_connection.data_generation,
      'provider', v_connection.provider,
      'providerAccountId', v_connection.provider_account_id,
      'authorityFenceId', v_connection.authority_fence_id,
      'authorityEpoch', v_connection.authority_epoch,
      'refreshTokenCiphertext', v_connection.refresh_token_enc
    )
  );

  SELECT *
  INTO v_begin
  FROM private.begin_calendar_revoke_operation_v1(
    p_operation_id,
    v_project_fence_id,
    v_subject_fence_id,
    p_user_id,
    p_connection_id,
    'disconnect',
    v_request_digest,
    'queued',
    v_now + INTERVAL '23 hours 59 minutes'
  );

  IF NOT v_begin.replayed THEN
    INSERT INTO private.calendar_revoke_outbox (
      id,
      user_id,
      source_connection_id,
      provider,
      refresh_token_enc,
      created_at,
      expires_at,
      authority_fence_id,
      authority_epoch
    ) VALUES (
      p_operation_id,
      p_user_id,
      p_connection_id,
      v_connection.provider,
      v_connection.refresh_token_enc,
      v_now,
      v_now + INTERVAL '23 hours 59 minutes',
      v_subject_fence_id,
      v_begin.operation_subject_epoch
    );
  END IF;

  DELETE FROM public.external_calendar_events AS event
  WHERE event.user_id = p_user_id
    AND event.connection_id = p_connection_id
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

  DELETE FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  RETURN 'queued';
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_calendar_connection_command_v1(
  UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_calendar_connection_command_v1(
  UUID, TEXT, UUID, UUID
) TO service_role;

COMMENT ON FUNCTION public.disconnect_calendar_connection_command_v1(
  UUID, TEXT, UUID, UUID
) IS
  'Atomically fences the exact Google subject, enqueues its current token, prunes unreferenced mirrors, and removes one Dayopt Calendar connection; service role only.';

CREATE FUNCTION public.delete_all_user_data_command_v4(
  p_project_key TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
DECLARE
  v_generation BIGINT;
  v_project_fence_id UUID;
  v_quarantine_fence_id UUID;
  v_subject_fence_id UUID;
  v_connection RECORD;
  v_operation_id UUID;
  v_request_digest BYTEA;
  v_begin RECORD;
  v_has_calendar_connections BOOLEAN;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);
  PERFORM private.assert_calendar_account_not_deleting_v1(p_user_id);

  IF EXISTS (
    SELECT 1
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
      AND connection.provider <> 'google'
  ) THEN
    RAISE EXCEPTION 'Unsupported Calendar provider cannot be purged safely'
      USING ERRCODE = 'CA017';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
      AND connection.provider = 'google'
  )
  INTO v_has_calendar_connections;

  IF v_has_calendar_connections THEN
    v_project_fence_id :=
      private.resolve_calendar_authority_project_fence_v1(p_project_key);

    PERFORM 1
    FROM private.calendar_authority_fences AS project
    WHERE project.id = v_project_fence_id
    FOR UPDATE;

    SELECT fence.id
    INTO v_quarantine_fence_id
    FROM private.calendar_authority_fences AS fence
    WHERE fence.project_key = p_project_key
      AND fence.scope_kind = 'quarantine'
    FOR UPDATE;

    FOR v_connection IN
      SELECT
        connection.id,
        connection.provider_account_id
      FROM public.calendar_connections AS connection
      WHERE connection.user_id = p_user_id
        AND connection.provider = 'google'
        AND connection.authority_fence_id IS NULL
      ORDER BY connection.provider_account_id, connection.id
    LOOP
      v_subject_fence_id :=
        private.get_or_create_calendar_subject_fence_v1(
          p_project_key,
          v_connection.provider_account_id
        );

      UPDATE public.calendar_connections AS connection
      SET authority_fence_id = v_subject_fence_id,
          authority_epoch = (
            SELECT fence.epoch
            FROM private.calendar_authority_fences AS fence
            WHERE fence.id = v_subject_fence_id
          )
      WHERE connection.id = v_connection.id
        AND connection.user_id = p_user_id
        AND connection.authority_fence_id IS NULL;
    END LOOP;

    FOR v_subject_fence_id IN
      SELECT DISTINCT connection.authority_fence_id
      FROM public.calendar_connections AS connection
      WHERE connection.user_id = p_user_id
        AND connection.provider = 'google'
        AND connection.authority_fence_id IS NOT NULL
      ORDER BY connection.authority_fence_id
    LOOP
      PERFORM 1
      FROM private.calendar_authority_fences AS subject
      WHERE subject.id = v_subject_fence_id
      FOR UPDATE;
    END LOOP;

    PERFORM 1
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
    ORDER BY connection.id
    FOR UPDATE;
  END IF;

  INSERT INTO private.user_data_controls (
    user_id,
    generation,
    changed_at
  ) VALUES (
    p_user_id,
    1,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
  SET generation = private.user_data_controls.generation + 1,
      changed_at = v_now
  RETURNING generation INTO v_generation;

  FOR v_connection IN
    SELECT
      connection.id,
      connection.provider,
      connection.refresh_token_enc,
      COALESCE(connection.authority_fence_id, v_quarantine_fence_id)
        AS authority_fence_id
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
      AND connection.provider = 'google'
    ORDER BY connection.id
  LOOP
    v_operation_id := gen_random_uuid();
    v_request_digest := private.digest_calendar_authority_operation_v1(
      'purge',
      pg_catalog.jsonb_build_object(
        'operationId', v_operation_id,
        'projectKey', p_project_key,
        'userId', p_user_id,
        'sourceConnectionId', v_connection.id,
        'provider', v_connection.provider,
        'refreshTokenCiphertext', v_connection.refresh_token_enc,
        'purgedGeneration', v_generation
      )
    );

    SELECT *
    INTO v_begin
    FROM private.begin_calendar_revoke_operation_v1(
      v_operation_id,
      v_project_fence_id,
      v_connection.authority_fence_id,
      p_user_id,
      v_connection.id,
      'purge',
      v_request_digest,
      'queued',
      v_now + INTERVAL '23 hours 59 minutes'
    );

    INSERT INTO private.calendar_revoke_outbox (
      id,
      user_id,
      source_connection_id,
      provider,
      refresh_token_enc,
      created_at,
      expires_at,
      authority_fence_id,
      authority_epoch
    ) VALUES (
      v_operation_id,
      p_user_id,
      v_connection.id,
      v_connection.provider,
      v_connection.refresh_token_enc,
      v_now,
      v_now + INTERVAL '23 hours 59 minutes',
      v_connection.authority_fence_id,
      v_begin.operation_subject_epoch
    );
  END LOOP;

  UPDATE public.oauth_authorization_codes AS code
  SET consumed_at = COALESCE(code.consumed_at, v_now)
  WHERE code.user_id = p_user_id;

  UPDATE public.oauth_connections AS connection
  SET revoked_at = COALESCE(connection.revoked_at, v_now),
      revoked_reason = COALESCE(connection.revoked_reason, 'user_data_purge')
  WHERE connection.user_id = p_user_id;

  UPDATE public.oauth_tokens AS token
  SET revoked_at = COALESCE(token.revoked_at, v_now)
  WHERE token.user_id = p_user_id;

  UPDATE public.mcp_mutation_receipts AS receipt
  SET resource_deleted_at = COALESCE(receipt.resource_deleted_at, v_now),
      purged_generation = v_generation,
      purged_at = v_now
  WHERE receipt.user_id = p_user_id
    AND receipt.purged_generation IS NULL;

  DELETE FROM public.records
  WHERE user_id = p_user_id;

  DELETE FROM public.plans
  WHERE user_id = p_user_id;

  DELETE FROM public.reports
  WHERE user_id = p_user_id;

  DELETE FROM public.tags
  WHERE user_id = p_user_id;

  DELETE FROM public.user_settings
  WHERE user_id = p_user_id;

  DELETE FROM public.calendar_connections
  WHERE user_id = p_user_id;

  DELETE FROM public.external_calendar_events
  WHERE user_id = p_user_id;

  INSERT INTO private.integration_security_events (
    user_id,
    event_kind,
    occurred_at
  ) VALUES (
    p_user_id,
    'user_data_purged',
    v_now
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_all_user_data_command_v4(TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_user_data_command_v4(TEXT, UUID)
  TO service_role;

COMMENT ON FUNCTION public.delete_all_user_data_command_v4(TEXT, UUID) IS
  'Atomically advances user generation, registers subject-scoped Calendar revocations, and purges Dayopt data; service role only.';

COMMIT;
