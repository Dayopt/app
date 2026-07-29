-- Add the four typed Record operations to the private MCP mutation envelope.
-- No MCP write tool is registered here and the durable global mutation
-- control remains OFF by default.

-- =============================================================================
-- 1. Record create
-- =============================================================================

CREATE FUNCTION public.apply_mcp_record_create_v1(
  p_connection_id UUID,
  p_access_token_id UUID,
  p_operation_id UUID,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_plan_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS TABLE(
  schema_version SMALLINT,
  operation_id UUID,
  resource_type TEXT,
  resource_id UUID,
  version TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_client_id TEXT;
  v_authority_expires_at TIMESTAMPTZ;
  v_request_digest BYTEA;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
  v_record public.records%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_start_at IS NULL
    OR p_end_at IS NULL THEN
    RAISE EXCEPTION 'MCP Record create input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT pg_catalog.isfinite(p_start_at) OR NOT pg_catalog.isfinite(p_end_at) THEN
    RAISE EXCEPTION 'MCP Record timestamps must be finite'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    auth_result.user_id,
    auth_result.client_id,
    auth_result.authority_expires_at
  INTO v_user_id, v_client_id, v_authority_expires_at
  FROM private.authorize_mcp_mutation_v1(
    p_connection_id,
    p_access_token_id,
    'write:records'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'records.create'::TEXT,
    pg_catalog.jsonb_build_object(
      'title', p_title,
      'note', p_note,
      'tagId', p_tag_id,
      'planId', p_plan_id,
      'externalCalendarEventId', NULL::UUID,
      'source', 'api',
      'startAt', pg_catalog.to_char(
        p_start_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'endAt', pg_catalog.to_char(
        p_end_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    )
  );

  SELECT replay_receipt.*
  INTO v_receipt
  FROM private.resolve_mcp_mutation_replay_v1(
    v_user_id,
    v_client_id,
    p_operation_id,
    'records.create'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'record'::TEXT
  ) AS replay_receipt;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP mutation receipt invariant failed'
        USING ERRCODE = 'DM007';
    END IF;

    RETURN QUERY SELECT
      v_receipt.envelope_version,
      v_receipt.operation_id,
      v_receipt.resource_type,
      v_receipt.resource_id,
      v_receipt.resource_version,
      v_receipt.resource_deleted_at,
      true;
    RETURN;
  END IF;

  SELECT record.*
  INTO v_record
  FROM public.create_record_command_v1(
    v_user_id,
    p_title,
    p_note,
    p_tag_id,
    p_plan_id,
    NULL::UUID,
    'api'::TEXT,
    p_start_at,
    p_end_at
  ) AS record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_record.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'MCP mutation result invariant failed'
      USING ERRCODE = 'DM007';
  END IF;

  -- Record create may wait on a linked Plan row and the Record exclusion
  -- constraint. Expiry after either wait rolls back the row and receipt.
  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  INSERT INTO public.mcp_mutation_receipts (
    user_id,
    client_id,
    operation_id,
    origin_connection_id,
    envelope_version,
    tool_name,
    request_digest,
    resource_type,
    resource_id,
    resource_version,
    resource_deleted_at
  ) VALUES (
    v_user_id,
    v_client_id,
    p_operation_id,
    p_connection_id,
    1,
    'records.create',
    v_request_digest,
    'record',
    v_record.id,
    v_record.updated_at,
    v_record.deleted_at
  )
  RETURNING * INTO v_receipt;

  RETURN QUERY SELECT
    v_receipt.envelope_version,
    v_receipt.operation_id,
    v_receipt.resource_type,
    v_receipt.resource_id,
    v_receipt.resource_version,
    v_receipt.resource_deleted_at,
    false;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_mcp_record_create_v1(
  UUID, UUID, UUID, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_record_create_v1(
  UUID, UUID, UUID, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.apply_mcp_record_create_v1(
  UUID, UUID, UUID, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) IS
  'Applies one authorized MCP Record creation and its immutable receipt atomically.';

-- =============================================================================
-- 2. Partial Record update
-- =============================================================================

CREATE FUNCTION public.apply_mcp_record_update_v1(
  p_connection_id UUID,
  p_access_token_id UUID,
  p_operation_id UUID,
  p_record_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_title_present BOOLEAN,
  p_title TEXT,
  p_note_present BOOLEAN,
  p_note TEXT,
  p_tag_id_present BOOLEAN,
  p_tag_id UUID,
  p_start_at_present BOOLEAN,
  p_start_at TIMESTAMPTZ,
  p_end_at_present BOOLEAN,
  p_end_at TIMESTAMPTZ
)
RETURNS TABLE(
  schema_version SMALLINT,
  operation_id UUID,
  resource_type TEXT,
  resource_id UUID,
  version TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_client_id TEXT;
  v_authority_expires_at TIMESTAMPTZ;
  v_normalized_args JSONB;
  v_request_digest BYTEA;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
  v_existing public.records%ROWTYPE;
  v_record public.records%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_record_id IS NULL
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'MCP Record update input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF p_title_present IS NULL
    OR p_note_present IS NULL
    OR p_tag_id_present IS NULL
    OR p_start_at_present IS NULL
    OR p_end_at_present IS NULL THEN
    RAISE EXCEPTION 'MCP Record update field presence is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT p_title_present
    AND NOT p_note_present
    AND NOT p_tag_id_present
    AND NOT p_start_at_present
    AND NOT p_end_at_present THEN
    RAISE EXCEPTION 'MCP Record update patch is empty'
      USING ERRCODE = '22023';
  END IF;

  IF (p_title_present AND p_title IS NULL)
    OR (NOT p_title_present AND p_title IS NOT NULL)
    OR (NOT p_note_present AND p_note IS NOT NULL)
    OR (NOT p_tag_id_present AND p_tag_id IS NOT NULL)
    OR (p_start_at_present AND p_start_at IS NULL)
    OR (NOT p_start_at_present AND p_start_at IS NOT NULL)
    OR (p_end_at_present AND p_end_at IS NULL)
    OR (NOT p_end_at_present AND p_end_at IS NOT NULL) THEN
    RAISE EXCEPTION 'MCP Record update patch shape is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF NOT pg_catalog.isfinite(p_expected_updated_at)
    OR (p_start_at_present AND NOT pg_catalog.isfinite(p_start_at))
    OR (p_end_at_present AND NOT pg_catalog.isfinite(p_end_at)) THEN
    RAISE EXCEPTION 'MCP Record update timestamps must be finite'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    auth_result.user_id,
    auth_result.client_id,
    auth_result.authority_expires_at
  INTO v_user_id, v_client_id, v_authority_expires_at
  FROM private.authorize_mcp_mutation_v1(
    p_connection_id,
    p_access_token_id,
    'write:records'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  v_normalized_args := pg_catalog.jsonb_build_object(
    'recordId', p_record_id,
    'expectedUpdatedAt', pg_catalog.to_char(
      p_expected_updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );

  IF p_title_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('title', p_title);
  END IF;
  IF p_note_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('note', p_note);
  END IF;
  IF p_tag_id_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('tagId', p_tag_id);
  END IF;
  IF p_start_at_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object(
        'startAt', pg_catalog.to_char(
          p_start_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      );
  END IF;
  IF p_end_at_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object(
        'endAt', pg_catalog.to_char(
          p_end_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      );
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'records.update'::TEXT,
    v_normalized_args
  );

  SELECT replay_receipt.*
  INTO v_receipt
  FROM private.resolve_mcp_mutation_replay_v1(
    v_user_id,
    v_client_id,
    p_operation_id,
    'records.update'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'record'::TEXT
  ) AS replay_receipt;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_id IS DISTINCT FROM p_record_id
      OR v_receipt.resource_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP mutation receipt invariant failed'
        USING ERRCODE = 'DM007';
    END IF;

    RETURN QUERY SELECT
      v_receipt.envelope_version,
      v_receipt.operation_id,
      v_receipt.resource_type,
      v_receipt.resource_id,
      v_receipt.resource_version,
      v_receipt.resource_deleted_at,
      true;
    RETURN;
  END IF;

  SELECT record.*
  INTO v_existing
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = v_user_id
    AND record.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  -- Public MCP updates cannot alter Plan attribution, source, or external
  -- calendar provenance. Those values pass through from the locked row.
  SELECT record.*
  INTO v_record
  FROM public.update_record_command_v1(
    v_user_id,
    p_record_id,
    p_expected_updated_at,
    CASE WHEN p_title_present THEN p_title ELSE v_existing.title END,
    CASE WHEN p_note_present THEN p_note ELSE v_existing.note END,
    CASE WHEN p_tag_id_present THEN p_tag_id ELSE v_existing.tag_id END,
    v_existing.plan_id,
    v_existing.external_calendar_event_id,
    CASE WHEN p_start_at_present THEN p_start_at ELSE v_existing.start_at END,
    CASE WHEN p_end_at_present THEN p_end_at ELSE v_existing.end_at END
  ) AS record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_record.id IS DISTINCT FROM p_record_id
    OR v_record.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'MCP mutation result invariant failed'
      USING ERRCODE = 'DM007';
  END IF;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  INSERT INTO public.mcp_mutation_receipts (
    user_id,
    client_id,
    operation_id,
    origin_connection_id,
    envelope_version,
    tool_name,
    request_digest,
    resource_type,
    resource_id,
    resource_version,
    resource_deleted_at
  ) VALUES (
    v_user_id,
    v_client_id,
    p_operation_id,
    p_connection_id,
    1,
    'records.update',
    v_request_digest,
    'record',
    v_record.id,
    v_record.updated_at,
    v_record.deleted_at
  )
  RETURNING * INTO v_receipt;

  RETURN QUERY SELECT
    v_receipt.envelope_version,
    v_receipt.operation_id,
    v_receipt.resource_type,
    v_receipt.resource_id,
    v_receipt.resource_version,
    v_receipt.resource_deleted_at,
    false;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_mcp_record_update_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, UUID,
  BOOLEAN, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_record_update_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, UUID,
  BOOLEAN, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.apply_mcp_record_update_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, UUID,
  BOOLEAN, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) IS
  'Applies one authorized partial MCP Record update while preserving attribution and provenance.';

-- =============================================================================
-- 3. Record delete
-- =============================================================================

CREATE FUNCTION public.apply_mcp_record_delete_v1(
  p_connection_id UUID,
  p_access_token_id UUID,
  p_operation_id UUID,
  p_record_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS TABLE(
  schema_version SMALLINT,
  operation_id UUID,
  resource_type TEXT,
  resource_id UUID,
  version TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_client_id TEXT;
  v_authority_expires_at TIMESTAMPTZ;
  v_request_digest BYTEA;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
  v_record public.records%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_record_id IS NULL
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'MCP Record delete input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT pg_catalog.isfinite(p_expected_updated_at) THEN
    RAISE EXCEPTION 'MCP Record delete timestamp must be finite'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    auth_result.user_id,
    auth_result.client_id,
    auth_result.authority_expires_at
  INTO v_user_id, v_client_id, v_authority_expires_at
  FROM private.authorize_mcp_mutation_v1(
    p_connection_id,
    p_access_token_id,
    'delete:records'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'records.delete'::TEXT,
    pg_catalog.jsonb_build_object(
      'recordId', p_record_id,
      'expectedUpdatedAt', pg_catalog.to_char(
        p_expected_updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    )
  );

  SELECT replay_receipt.*
  INTO v_receipt
  FROM private.resolve_mcp_mutation_replay_v1(
    v_user_id,
    v_client_id,
    p_operation_id,
    'records.delete'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'record'::TEXT
  ) AS replay_receipt;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_id IS DISTINCT FROM p_record_id
      OR v_receipt.resource_deleted_at IS NULL THEN
      RAISE EXCEPTION 'MCP mutation receipt invariant failed'
        USING ERRCODE = 'DM007';
    END IF;

    RETURN QUERY SELECT
      v_receipt.envelope_version,
      v_receipt.operation_id,
      v_receipt.resource_type,
      v_receipt.resource_id,
      v_receipt.resource_version,
      v_receipt.resource_deleted_at,
      true;
    RETURN;
  END IF;

  SELECT record.*
  INTO v_record
  FROM public.delete_record_command_v1(
    v_user_id,
    p_record_id,
    p_expected_updated_at
  ) AS record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_record.id IS DISTINCT FROM p_record_id
    OR v_record.deleted_at IS NULL THEN
    RAISE EXCEPTION 'MCP mutation result invariant failed'
      USING ERRCODE = 'DM007';
  END IF;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  INSERT INTO public.mcp_mutation_receipts (
    user_id,
    client_id,
    operation_id,
    origin_connection_id,
    envelope_version,
    tool_name,
    request_digest,
    resource_type,
    resource_id,
    resource_version,
    resource_deleted_at
  ) VALUES (
    v_user_id,
    v_client_id,
    p_operation_id,
    p_connection_id,
    1,
    'records.delete',
    v_request_digest,
    'record',
    v_record.id,
    v_record.updated_at,
    v_record.deleted_at
  )
  RETURNING * INTO v_receipt;

  RETURN QUERY SELECT
    v_receipt.envelope_version,
    v_receipt.operation_id,
    v_receipt.resource_type,
    v_receipt.resource_id,
    v_receipt.resource_version,
    v_receipt.resource_deleted_at,
    false;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_mcp_record_delete_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_record_delete_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.apply_mcp_record_delete_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) IS
  'Applies one authorized MCP Record deletion and its immutable receipt atomically.';

-- =============================================================================
-- 4. Record restore
-- =============================================================================

CREATE FUNCTION public.apply_mcp_record_restore_v1(
  p_connection_id UUID,
  p_access_token_id UUID,
  p_operation_id UUID,
  p_record_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS TABLE(
  schema_version SMALLINT,
  operation_id UUID,
  resource_type TEXT,
  resource_id UUID,
  version TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_client_id TEXT;
  v_authority_expires_at TIMESTAMPTZ;
  v_request_digest BYTEA;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
  v_record public.records%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_record_id IS NULL
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'MCP Record restore input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT pg_catalog.isfinite(p_expected_updated_at) THEN
    RAISE EXCEPTION 'MCP Record restore timestamp must be finite'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    auth_result.user_id,
    auth_result.client_id,
    auth_result.authority_expires_at
  INTO v_user_id, v_client_id, v_authority_expires_at
  FROM private.authorize_mcp_mutation_v1(
    p_connection_id,
    p_access_token_id,
    'delete:records'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'records.restore'::TEXT,
    pg_catalog.jsonb_build_object(
      'recordId', p_record_id,
      'expectedUpdatedAt', pg_catalog.to_char(
        p_expected_updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    )
  );

  SELECT replay_receipt.*
  INTO v_receipt
  FROM private.resolve_mcp_mutation_replay_v1(
    v_user_id,
    v_client_id,
    p_operation_id,
    'records.restore'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'record'::TEXT
  ) AS replay_receipt;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_id IS DISTINCT FROM p_record_id
      OR v_receipt.resource_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP mutation receipt invariant failed'
        USING ERRCODE = 'DM007';
    END IF;

    RETURN QUERY SELECT
      v_receipt.envelope_version,
      v_receipt.operation_id,
      v_receipt.resource_type,
      v_receipt.resource_id,
      v_receipt.resource_version,
      v_receipt.resource_deleted_at,
      true;
    RETURN;
  END IF;

  SELECT record.*
  INTO v_record
  FROM public.restore_record_command_v1(
    v_user_id,
    p_record_id,
    p_expected_updated_at
  ) AS record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_record.id IS DISTINCT FROM p_record_id
    OR v_record.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'MCP mutation result invariant failed'
      USING ERRCODE = 'DM007';
  END IF;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  INSERT INTO public.mcp_mutation_receipts (
    user_id,
    client_id,
    operation_id,
    origin_connection_id,
    envelope_version,
    tool_name,
    request_digest,
    resource_type,
    resource_id,
    resource_version,
    resource_deleted_at
  ) VALUES (
    v_user_id,
    v_client_id,
    p_operation_id,
    p_connection_id,
    1,
    'records.restore',
    v_request_digest,
    'record',
    v_record.id,
    v_record.updated_at,
    v_record.deleted_at
  )
  RETURNING * INTO v_receipt;

  RETURN QUERY SELECT
    v_receipt.envelope_version,
    v_receipt.operation_id,
    v_receipt.resource_type,
    v_receipt.resource_id,
    v_receipt.resource_version,
    v_receipt.resource_deleted_at,
    false;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_mcp_record_restore_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_record_restore_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.apply_mcp_record_restore_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) IS
  'Applies one authorized MCP Record restoration and its immutable receipt atomically.';
