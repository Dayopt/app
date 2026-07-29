-- Draft: private fence state machine, one-time project provisioning, and the
-- OAuth-start epoch snapshot. Depends on the 060000 draft.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION private.resolve_calendar_authority_project_fence_v1(
  p_project_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_fence_id UUID;
BEGIN
  IF p_project_key IS NULL
    OR p_project_key !~ '^[1-9][0-9]{5,29}$' THEN
    RAISE EXCEPTION 'Invalid Calendar authority project'
      USING ERRCODE = '22023';
  END IF;

  SELECT fence.id
  INTO v_project_fence_id
  FROM private.calendar_authority_projects AS project
  JOIN private.calendar_authority_fences AS fence
    ON fence.project_key = project.project_key
   AND fence.scope_kind = 'project'
  WHERE project.singleton
    AND project.project_key = p_project_key
    AND project.activation_version = 1
    AND project.activated_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar authority project is not active'
      USING ERRCODE = 'CA010';
  END IF;

  RETURN v_project_fence_id;
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_calendar_authority_project_fence_v1(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.assert_calendar_account_not_deleting_v1(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM private.calendar_account_deletion_intents AS intent
    WHERE intent.user_id = p_user_id
      AND (
        intent.state = 'ready'
        OR intent.expires_at > pg_catalog.clock_timestamp()
      )
  ) THEN
    RAISE EXCEPTION 'Calendar authority is closing for account deletion'
      USING ERRCODE = 'CA019';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
  private.assert_calendar_account_not_deleting_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.get_or_create_calendar_subject_fence_v1(
  p_project_key TEXT,
  p_provider_account_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subject_fence_id UUID;
BEGIN
  IF NULLIF(pg_catalog.btrim(p_provider_account_id), '') IS NULL
    OR p_provider_account_id IS DISTINCT FROM pg_catalog.btrim(p_provider_account_id)
    OR pg_catalog.length(p_provider_account_id) > 255 THEN
    RAISE EXCEPTION 'Invalid Calendar authority subject'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO private.calendar_authority_fences (
    project_key,
    scope_kind,
    provider_account_id
  ) VALUES (
    p_project_key,
    'subject',
    p_provider_account_id
  )
  ON CONFLICT (project_key, provider_account_id)
    WHERE scope_kind = 'subject'
  DO NOTHING;

  SELECT fence.id
  INTO v_subject_fence_id
  FROM private.calendar_authority_fences AS fence
  WHERE fence.project_key = p_project_key
    AND fence.scope_kind = 'subject'
    AND fence.provider_account_id = p_provider_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar authority subject is unavailable'
      USING ERRCODE = 'CA011';
  END IF;

  RETURN v_subject_fence_id;
END;
$$;

REVOKE ALL ON FUNCTION private.get_or_create_calendar_subject_fence_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.lock_calendar_authority_fence_pair_v1(
  p_project_key TEXT,
  p_subject_fence_id UUID
)
RETURNS TABLE (
  project_fence_id UUID,
  project_epoch BIGINT,
  project_state TEXT,
  subject_epoch BIGINT,
  subject_state TEXT,
  subject_scope_kind TEXT,
  subject_ready_after_project_epoch BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_project_fence_id UUID;
BEGIN
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  SELECT
    project.id,
    project.epoch,
    project.state
  INTO
    project_fence_id,
    project_epoch,
    project_state
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT
    subject.epoch,
    subject.state,
    subject.scope_kind,
    subject.ready_after_project_epoch
  INTO
    subject_epoch,
    subject_state,
    subject_scope_kind,
    subject_ready_after_project_epoch
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = p_subject_fence_id
    AND subject.project_key = p_project_key
    AND subject.scope_kind IN ('subject', 'quarantine')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar authority fence is unavailable'
      USING ERRCODE = 'CA011';
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.lock_calendar_authority_fence_pair_v1(TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.begin_calendar_revoke_operation_v1(
  p_operation_id UUID,
  p_project_fence_id UUID,
  p_subject_fence_id UUID,
  p_source_user_id UUID,
  p_source_connection_id UUID,
  p_operation_kind TEXT,
  p_request_digest BYTEA,
  p_initial_result TEXT,
  p_expires_at TIMESTAMPTZ,
  p_account_deletion_id UUID DEFAULT NULL,
  p_account_deletion_item_kind TEXT DEFAULT NULL,
  p_account_deletion_item_id UUID DEFAULT NULL
)
RETURNS TABLE (
  replayed BOOLEAN,
  operation_state TEXT,
  operation_result TEXT,
  operation_subject_epoch BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing private.calendar_revoke_operations%ROWTYPE;
  v_project_key TEXT;
  v_subject_scope TEXT;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF p_operation_id IS NULL
    OR p_project_fence_id IS NULL
    OR p_subject_fence_id IS NULL
    OR p_source_connection_id IS NULL
    OR p_operation_kind NOT IN (
      'account_delete',
      'connection_save',
      'disconnect',
      'legacy_quarantine',
      'purge',
      'token_rotation',
      'token_rotation_recovery'
    )
    OR p_request_digest IS NULL
    OR pg_catalog.octet_length(p_request_digest) <> 32
    OR p_initial_result NOT IN ('enqueued', 'marked', 'missing', 'queued')
    OR p_expires_at IS NULL
    OR p_expires_at <= v_now
    OR (
      p_operation_kind = 'account_delete'
      AND (
        p_account_deletion_id IS NULL
        OR p_account_deletion_item_kind NOT IN ('connection', 'outbox')
        OR p_account_deletion_item_id IS NULL
      )
    )
    OR (
      p_operation_kind <> 'account_delete'
      AND (
        p_account_deletion_id IS NOT NULL
        OR p_account_deletion_item_kind IS NOT NULL
        OR p_account_deletion_item_id IS NOT NULL
      )
    ) THEN
    RAISE EXCEPTION 'Invalid Calendar revoke operation'
      USING ERRCODE = '22023';
  END IF;

  IF p_source_user_id IS NULL
    AND p_operation_kind IS DISTINCT FROM 'legacy_quarantine' THEN
    RAISE EXCEPTION 'Calendar revoke operation requires a source user'
      USING ERRCODE = '22023';
  END IF;

  SELECT project.project_key
  INTO v_project_key
  FROM private.calendar_authority_fences AS project
  WHERE project.id = p_project_fence_id
    AND project.scope_kind = 'project'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar project fence is unavailable'
      USING ERRCODE = 'CA011';
  END IF;

  SELECT subject.scope_kind
  INTO v_subject_scope
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = p_subject_fence_id
    AND subject.project_key = v_project_key
    AND subject.scope_kind IN ('subject', 'quarantine')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar subject fence is unavailable'
      USING ERRCODE = 'CA011';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.calendar_authority_command_receipts AS receipt
    WHERE receipt.operation_id = p_operation_id
  ) THEN
    RAISE EXCEPTION 'Calendar authority operation was reused'
      USING ERRCODE = 'CA004';
  END IF;

  SELECT operation.*
  INTO v_existing
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.project_fence_id IS DISTINCT FROM p_project_fence_id
      OR v_existing.subject_fence_id IS DISTINCT FROM p_subject_fence_id
      OR v_existing.source_user_id IS DISTINCT FROM p_source_user_id
      OR v_existing.source_connection_id IS DISTINCT FROM p_source_connection_id
      OR v_existing.account_deletion_id IS DISTINCT FROM p_account_deletion_id
      OR v_existing.account_deletion_item_kind
        IS DISTINCT FROM p_account_deletion_item_kind
      OR v_existing.account_deletion_item_id
        IS DISTINCT FROM p_account_deletion_item_id
      OR v_existing.operation_kind IS DISTINCT FROM p_operation_kind
      OR v_existing.request_digest IS DISTINCT FROM p_request_digest THEN
      RAISE EXCEPTION 'Calendar authority operation was reused'
        USING ERRCODE = 'CA004';
    END IF;

    replayed := TRUE;
    operation_state := v_existing.state;
    operation_result := v_existing.initial_result;
    operation_subject_epoch := v_existing.subject_fence_epoch;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE private.calendar_authority_fences AS project
  SET epoch = project.epoch + 1,
      changed_at = v_now
  WHERE project.id = p_project_fence_id;

  UPDATE private.calendar_authority_fences AS subject
  SET epoch = CASE
        WHEN subject.pending_operation_count = 0
          THEN subject.epoch + 1
        ELSE subject.epoch
      END,
      state = 'pending',
      pending_operation_count = subject.pending_operation_count + 1,
      changed_at = v_now
  WHERE subject.id = p_subject_fence_id
  RETURNING subject.epoch INTO operation_subject_epoch;

  INSERT INTO private.calendar_revoke_operations (
    operation_id,
    project_fence_id,
    subject_fence_id,
    subject_fence_epoch,
    source_user_id,
    source_connection_id,
    account_deletion_id,
    account_deletion_item_kind,
    account_deletion_item_id,
    operation_kind,
    request_digest,
    state,
    initial_result,
    created_at,
    expires_at
  ) VALUES (
    p_operation_id,
    p_project_fence_id,
    p_subject_fence_id,
    operation_subject_epoch,
    p_source_user_id,
    p_source_connection_id,
    p_account_deletion_id,
    p_account_deletion_item_kind,
    p_account_deletion_item_id,
    p_operation_kind,
    p_request_digest,
    'pending',
    p_initial_result,
    v_now,
    p_expires_at
  );

  IF v_subject_scope = 'quarantine' THEN
    UPDATE public.calendar_connections AS connection
    SET status = 'reauth_required',
        last_sync_error = 'reauth_required'
    FROM private.calendar_authority_fences AS connection_fence
    WHERE connection.authority_fence_id = connection_fence.id
      AND connection_fence.project_key = v_project_key;
  ELSE
    UPDATE public.calendar_connections AS connection
    SET status = 'reauth_required',
        last_sync_error = 'reauth_required'
    WHERE connection.authority_fence_id = p_subject_fence_id;
  END IF;

  replayed := FALSE;
  operation_state := 'pending';
  operation_result := p_initial_result;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.begin_calendar_revoke_operation_v1(
  UUID, UUID, UUID, UUID, UUID, TEXT, BYTEA, TEXT, TIMESTAMPTZ,
  UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.settle_calendar_revoke_operation_v1(
  p_operation_id UUID,
  p_terminal_state TEXT,
  p_settled_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operation private.calendar_revoke_operations%ROWTYPE;
  v_project_fence_id UUID;
  v_subject_fence_id UUID;
  v_project_epoch BIGINT;
  v_subject_pending_count INTEGER;
BEGIN
  IF p_operation_id IS NULL
    OR p_terminal_state NOT IN ('revoked', 'expired')
    OR p_settled_at IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar revoke settlement'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    operation.project_fence_id,
    operation.subject_fence_id
  INTO
    v_project_fence_id,
    v_subject_fence_id
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
    AND project.scope_kind = 'project'
  FOR UPDATE;

  PERFORM 1
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_subject_fence_id
    AND subject.scope_kind IN ('subject', 'quarantine')
  FOR UPDATE;

  SELECT operation.*
  INTO v_operation
  FROM private.calendar_revoke_operations AS operation
  WHERE operation.operation_id = p_operation_id
    AND operation.project_fence_id = v_project_fence_id
    AND operation.subject_fence_id = v_subject_fence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_operation.state IN ('revoked', 'expired') THEN
    RETURN v_operation.state;
  END IF;

  UPDATE private.calendar_revoke_operations AS operation
  SET state = p_terminal_state,
      active_lease_id = NULL,
      active_lease_expires_at = NULL,
      guard_until = NULL,
      settled_at = p_settled_at,
      delete_after = p_settled_at + INTERVAL '90 days'
  WHERE operation.operation_id = p_operation_id;

  SELECT subject.pending_operation_count
  INTO v_subject_pending_count
  FROM private.calendar_authority_fences AS subject
  WHERE subject.id = v_subject_fence_id;

  IF v_subject_pending_count IS NULL OR v_subject_pending_count <= 0 THEN
    RAISE EXCEPTION 'Calendar authority pending count invariant failed'
      USING ERRCODE = 'CA012';
  END IF;

  IF v_subject_pending_count = 1 THEN
    UPDATE private.calendar_authority_fences AS project
    SET epoch = project.epoch + 1,
        changed_at = p_settled_at
    WHERE project.id = v_project_fence_id
    RETURNING project.epoch INTO v_project_epoch;

    UPDATE private.calendar_authority_fences AS subject
    SET pending_operation_count = 0,
        state = 'ready',
        epoch = subject.epoch + 1,
        ready_after_project_epoch = v_project_epoch,
        changed_at = p_settled_at
    WHERE subject.id = v_subject_fence_id;
  ELSE
    UPDATE private.calendar_authority_fences AS subject
    SET pending_operation_count = subject.pending_operation_count - 1,
        changed_at = p_settled_at
    WHERE subject.id = v_subject_fence_id;
  END IF;

  RETURN p_terminal_state;
END;
$$;

REVOKE ALL ON FUNCTION private.settle_calendar_revoke_operation_v1(
  UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.provision_calendar_authority_project_v1(
  p_project_key TEXT,
  p_oauth_client_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
DECLARE
  v_existing_project_key TEXT;
  v_existing_oauth_client_id TEXT;
  v_project_fence_id UUID;
  v_quarantine_fence_id UUID;
  v_subject_fence_id UUID;
  v_subject_epoch BIGINT;
  v_connection RECORD;
  v_queued RECORD;
  v_begin RECORD;
  v_operation_id UUID;
  v_request_digest BYTEA;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_result TEXT := 'existing';
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_project_key IS NULL
    OR p_project_key !~ '^[1-9][0-9]{5,29}$'
    OR p_oauth_client_id IS NULL
    OR p_oauth_client_id
      !~ '^[1-9][0-9]{5,29}-[A-Za-z0-9_-]+[.]apps[.]googleusercontent[.]com$'
    OR pg_catalog.split_part(p_oauth_client_id, '-', 1) IS DISTINCT FROM p_project_key THEN
    RAISE EXCEPTION 'Invalid Calendar authority project'
      USING ERRCODE = '22023';
  END IF;

  LOCK TABLE private.calendar_authority_projects IN EXCLUSIVE MODE;

  SELECT
    project.project_key,
    project.oauth_client_id
  INTO
    v_existing_project_key,
    v_existing_oauth_client_id
  FROM private.calendar_authority_projects AS project
  WHERE project.singleton
  FOR UPDATE;

  IF FOUND AND v_existing_project_key IS DISTINCT FROM p_project_key THEN
    RAISE EXCEPTION 'Calendar authority project identity is immutable'
      USING ERRCODE = 'CA013';
  END IF;

  IF FOUND AND v_existing_oauth_client_id IS DISTINCT FROM p_oauth_client_id THEN
    RAISE EXCEPTION 'Calendar OAuth client identity is immutable'
      USING ERRCODE = 'CA013';
  END IF;

  IF NOT FOUND THEN
    INSERT INTO private.calendar_authority_projects (
      singleton,
      project_key,
      oauth_client_id,
      provisioned_at
    ) VALUES (
      TRUE,
      p_project_key,
      p_oauth_client_id,
      v_now
    );
    v_result := 'provisioned';
  END IF;

  INSERT INTO private.calendar_authority_fences (
    project_key,
    scope_kind
  ) VALUES
    (p_project_key, 'project'),
    (p_project_key, 'quarantine')
  ON CONFLICT DO NOTHING;

  SELECT fence.id
  INTO v_project_fence_id
  FROM private.calendar_authority_fences AS fence
  WHERE fence.project_key = p_project_key
    AND fence.scope_kind = 'project'
  FOR UPDATE;

  SELECT fence.id
  INTO v_quarantine_fence_id
  FROM private.calendar_authority_fences AS fence
  WHERE fence.project_key = p_project_key
    AND fence.scope_kind = 'quarantine'
  FOR UPDATE;

  FOR v_connection IN
    SELECT DISTINCT connection.provider_account_id
    FROM public.calendar_connections AS connection
    WHERE connection.provider = 'google'
      AND connection.authority_fence_id IS NULL
    ORDER BY connection.provider_account_id
  LOOP
    v_subject_fence_id :=
      private.get_or_create_calendar_subject_fence_v1(
        p_project_key,
        v_connection.provider_account_id
      );

    SELECT fence.epoch
    INTO v_subject_epoch
    FROM private.calendar_authority_fences AS fence
    WHERE fence.id = v_subject_fence_id;

    UPDATE public.calendar_connections AS connection
    SET authority_fence_id = v_subject_fence_id,
        authority_epoch = v_subject_epoch
    WHERE connection.provider = 'google'
      AND connection.provider_account_id = v_connection.provider_account_id
      AND connection.authority_fence_id IS NULL;
  END LOOP;

  -- A legacy direct callback wrote data_generation=0. Do not promote a row
  -- across a user-data purge merely because the project is being provisioned.
  -- Preserve its ciphertext for revoke and fail-close every connection sharing
  -- the same Google subject.
  FOR v_connection IN
    SELECT
      connection.id,
      connection.user_id,
      connection.provider,
      connection.refresh_token_enc,
      connection.data_generation,
      connection.authority_fence_id,
      COALESCE(control.generation, 0) AS current_generation
    FROM public.calendar_connections AS connection
    LEFT JOIN private.user_data_controls AS control
      ON control.user_id = connection.user_id
    WHERE connection.provider = 'google'
      AND connection.authority_fence_id IS NOT NULL
      AND connection.data_generation IS DISTINCT FROM COALESCE(control.generation, 0)
    ORDER BY connection.authority_fence_id, connection.id
  LOOP
    v_request_digest := private.digest_calendar_authority_operation_v1(
      'legacy_quarantine',
      pg_catalog.jsonb_build_object(
        'projectKey', p_project_key,
        'userId', v_connection.user_id,
        'sourceConnectionId', v_connection.id,
        'provider', v_connection.provider,
        'refreshTokenCiphertext', v_connection.refresh_token_enc,
        'connectionGeneration', v_connection.data_generation,
        'currentGeneration', v_connection.current_generation
      )
    );

    IF EXISTS (
      SELECT 1
      FROM private.calendar_revoke_operations AS operation
      WHERE operation.source_user_id = v_connection.user_id
        AND operation.source_connection_id = v_connection.id
        AND operation.operation_kind = 'legacy_quarantine'
        AND operation.request_digest = v_request_digest
    ) THEN
      CONTINUE;
    END IF;

    v_operation_id := gen_random_uuid();

    SELECT *
    INTO v_begin
    FROM private.begin_calendar_revoke_operation_v1(
      v_operation_id,
      v_project_fence_id,
      v_connection.authority_fence_id,
      v_connection.user_id,
      v_connection.id,
      'legacy_quarantine',
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
      v_connection.user_id,
      v_connection.id,
      v_connection.provider,
      v_connection.refresh_token_enc,
      v_now,
      v_now + INTERVAL '23 hours 59 minutes',
      v_connection.authority_fence_id,
      v_begin.operation_subject_epoch
    );
  END LOOP;

  FOR v_queued IN
    SELECT
      queued.id,
      queued.user_id,
      queued.source_connection_id,
      queued.provider,
      queued.refresh_token_enc,
      queued.expires_at,
      connection.authority_fence_id AS connection_fence_id
    FROM private.calendar_revoke_outbox AS queued
    LEFT JOIN public.calendar_connections AS connection
      ON connection.id = queued.source_connection_id
     AND connection.user_id = queued.user_id
    WHERE queued.authority_fence_id IS NULL
    ORDER BY queued.id
  LOOP
    v_subject_fence_id := COALESCE(
      v_queued.connection_fence_id,
      v_quarantine_fence_id
    );

    v_request_digest := private.digest_calendar_authority_operation_v1(
      'legacy_quarantine',
      pg_catalog.jsonb_build_object(
        'operationId', v_queued.id,
        'userId', v_queued.user_id,
        'sourceConnectionId', v_queued.source_connection_id,
        'provider', v_queued.provider,
        'refreshTokenCiphertext', v_queued.refresh_token_enc
      )
    );

    SELECT *
    INTO v_begin
    FROM private.begin_calendar_revoke_operation_v1(
      v_queued.id,
      v_project_fence_id,
      v_subject_fence_id,
      v_queued.user_id,
      v_queued.source_connection_id,
      'legacy_quarantine',
      v_request_digest,
      'queued',
      v_queued.expires_at
    );

    UPDATE private.calendar_revoke_outbox AS queued
    SET authority_fence_id = v_subject_fence_id,
        authority_epoch = v_begin.operation_subject_epoch
    WHERE queued.id = v_queued.id
      AND queued.authority_fence_id IS NULL;
  END LOOP;

  UPDATE public.calendar_connections AS connection
  SET status = 'reauth_required',
      last_sync_error = 'reauth_required'
  WHERE (
      connection.authority_fence_id IN (
        SELECT operation.subject_fence_id
        FROM private.calendar_revoke_operations AS operation
        WHERE operation.state IN ('pending', 'revoke_guarded', 'expiry_guarded')
      )
      OR EXISTS (
        SELECT 1
        FROM private.calendar_revoke_operations AS operation
        WHERE operation.subject_fence_id = v_quarantine_fence_id
          AND operation.state IN ('pending', 'revoke_guarded', 'expiry_guarded')
      )
    )
    AND connection.provider = 'google';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_calendar_authority_project_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_calendar_authority_project_v1(TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.provision_calendar_authority_project_v1(TEXT, TEXT) IS
  'Immutably provisions one Google project identity and safely backfills subject or quarantine fences; service role only.';

CREATE FUNCTION public.begin_calendar_oauth_attempt_v1(
  p_project_key TEXT,
  p_user_id UUID,
  p_state_digest BYTEA,
  p_verifier_digest BYTEA
)
RETURNS TABLE (
  attempt_id UUID,
  operation_id UUID,
  connection_id UUID,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_data_generation BIGINT;
  v_project_fence_id UUID;
  v_project_epoch BIGINT;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL
    OR p_state_digest IS NULL
    OR pg_catalog.octet_length(p_state_digest) <> 32
    OR p_verifier_digest IS NULL
    OR pg_catalog.octet_length(p_verifier_digest) <> 32 THEN
    RAISE EXCEPTION 'Calendar OAuth attempt input is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_calendar_account_not_deleting_v1(p_user_id);
  v_data_generation := private.get_user_data_generation_v1(p_user_id);
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  SELECT fence.epoch
  INTO v_project_epoch
  FROM private.calendar_authority_fences AS fence
  WHERE fence.id = v_project_fence_id
  FOR UPDATE;

  attempt_id := gen_random_uuid();
  operation_id := gen_random_uuid();
  connection_id := gen_random_uuid();
  expires_at := v_now + INTERVAL '10 minutes';

  INSERT INTO private.calendar_oauth_attempts (
    id,
    project_fence_id,
    user_id,
    state_digest,
    verifier_digest,
    operation_id,
    connection_id,
    data_generation,
    project_epoch,
    created_at,
    expires_at,
    delete_after
  ) VALUES (
    attempt_id,
    v_project_fence_id,
    p_user_id,
    p_state_digest,
    p_verifier_digest,
    operation_id,
    connection_id,
    v_data_generation,
    v_project_epoch,
    v_now,
    expires_at,
    v_now + INTERVAL '24 hours'
  );

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_calendar_oauth_attempt_v1(TEXT, UUID, BYTEA, BYTEA)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_calendar_oauth_attempt_v1(TEXT, UUID, BYTEA, BYTEA)
  TO service_role;

COMMENT ON FUNCTION public.begin_calendar_oauth_attempt_v1(TEXT, UUID, BYTEA, BYTEA) IS
  'Stores one server-side Google OAuth state/PKCE attempt bound to user generation, project epoch, and save identity; service role only.';

CREATE FUNCTION public.claim_calendar_oauth_attempt_v1(
  p_project_key TEXT,
  p_user_id UUID,
  p_state_digest BYTEA,
  p_verifier_digest BYTEA
)
RETURNS TABLE (
  attempt_id UUID,
  operation_id UUID,
  connection_id UUID,
  data_generation BIGINT,
  project_epoch BIGINT,
  claim_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_project_fence_id UUID;
  v_attempt private.calendar_oauth_attempts%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL
    OR p_state_digest IS NULL
    OR pg_catalog.octet_length(p_state_digest) <> 32
    OR p_verifier_digest IS NULL
    OR pg_catalog.octet_length(p_verifier_digest) <> 32 THEN
    RAISE EXCEPTION 'Calendar OAuth attempt input is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_calendar_account_not_deleting_v1(p_user_id);
  v_project_fence_id :=
    private.resolve_calendar_authority_project_fence_v1(p_project_key);

  PERFORM 1
  FROM private.calendar_authority_fences AS project
  WHERE project.id = v_project_fence_id
  FOR UPDATE;

  SELECT attempt.*
  INTO v_attempt
  FROM private.calendar_oauth_attempts AS attempt
  WHERE attempt.project_fence_id = v_project_fence_id
    AND attempt.user_id = p_user_id
    AND attempt.state_digest = p_state_digest
    AND attempt.expires_at > v_now + INTERVAL '2 minutes'
    AND attempt.claimed_at IS NULL
    AND attempt.completed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND
    OR v_attempt.verifier_digest IS DISTINCT FROM p_verifier_digest THEN
    RAISE EXCEPTION 'Calendar OAuth attempt is unavailable'
      USING ERRCODE = 'CA016';
  END IF;

  UPDATE private.calendar_oauth_attempts AS attempt
  SET claimed_at = v_now,
      claim_expires_at = v_now + INTERVAL '2 minutes'
  WHERE attempt.id = v_attempt.id;

  attempt_id := v_attempt.id;
  operation_id := v_attempt.operation_id;
  connection_id := v_attempt.connection_id;
  data_generation := v_attempt.data_generation;
  project_epoch := v_attempt.project_epoch;
  claim_expires_at := v_now + INTERVAL '2 minutes';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_calendar_oauth_attempt_v1(
  TEXT, UUID, BYTEA, BYTEA
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_calendar_oauth_attempt_v1(
  TEXT, UUID, BYTEA, BYTEA
) TO service_role;

COMMENT ON FUNCTION public.claim_calendar_oauth_attempt_v1(
  TEXT, UUID, BYTEA, BYTEA
) IS
  'Claims one OAuth attempt exactly once with two minutes left for bounded code exchange and save after matching server-side state and PKCE digests; service role only.';

CREATE FUNCTION public.get_calendar_authority_readiness_v1(
  p_project_key TEXT,
  p_oauth_client_id TEXT
)
RETURNS TABLE (
  oauth_client_id TEXT,
  activated BOOLEAN,
  project_epoch BIGINT,
  project_state TEXT,
  pending_operations BIGINT,
  unbound_connections BIGINT,
  unbound_outbox BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_fence_id UUID;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  SELECT fence.id
  INTO v_project_fence_id
  FROM private.calendar_authority_projects AS project
  JOIN private.calendar_authority_fences AS fence
    ON fence.project_key = project.project_key
   AND fence.scope_kind = 'project'
  WHERE project.singleton
    AND project.project_key = p_project_key
    AND project.oauth_client_id = p_oauth_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar authority runtime identity does not match the database'
      USING ERRCODE = 'CA013';
  END IF;

  RETURN QUERY
  SELECT
    project.oauth_client_id,
    project.activation_version = 1
      AND project.activated_at IS NOT NULL,
    fence.epoch,
    fence.state,
    (
      SELECT pg_catalog.count(*)
      FROM private.calendar_revoke_operations AS operation
      WHERE operation.project_fence_id = v_project_fence_id
        AND operation.state IN ('pending', 'revoke_guarded', 'expiry_guarded')
    ),
    (
      SELECT pg_catalog.count(*)
      FROM public.calendar_connections AS connection
      WHERE connection.provider = 'google'
        AND (
          connection.authority_fence_id IS NULL
          OR connection.authority_epoch IS NULL
        )
    ),
    (
      SELECT pg_catalog.count(*)
      FROM private.calendar_revoke_outbox AS queued
      WHERE queued.provider = 'google'
        AND (
          queued.authority_fence_id IS NULL
          OR queued.authority_epoch IS NULL
        )
    )
  FROM private.calendar_authority_projects AS project
  JOIN private.calendar_authority_fences AS fence
    ON fence.project_key = project.project_key
   AND fence.scope_kind = 'project'
  WHERE project.singleton
    AND fence.id = v_project_fence_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_calendar_authority_readiness_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_calendar_authority_readiness_v1(TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.get_calendar_authority_readiness_v1(TEXT, TEXT) IS
  'Verifies the immutable full Google OAuth client identity and returns aggregate-only Calendar authority rollout readiness; service role only.';

COMMIT;
