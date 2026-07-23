-- Extend the private MCP mutation boundary to Plan update, delete, and
-- restore. No MCP write tool is registered here and the durable global
-- mutation control remains OFF by default.

-- =============================================================================
-- 1. Partial Plan update
-- =============================================================================

CREATE FUNCTION public.apply_mcp_plan_update_v1(
  p_connection_id UUID,
  p_access_token_id UUID,
  p_operation_id UUID,
  p_plan_id UUID,
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
  v_decision_at TIMESTAMPTZ;
  v_normalized_args JSONB;
  v_request_digest BYTEA;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
  v_existing public.plans%ROWTYPE;
  v_plan public.plans%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_plan_id IS NULL
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'MCP Plan update input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF p_title_present IS NULL
    OR p_note_present IS NULL
    OR p_tag_id_present IS NULL
    OR p_start_at_present IS NULL
    OR p_end_at_present IS NULL THEN
    RAISE EXCEPTION 'MCP Plan update field presence is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT p_title_present
    AND NOT p_note_present
    AND NOT p_tag_id_present
    AND NOT p_start_at_present
    AND NOT p_end_at_present THEN
    RAISE EXCEPTION 'MCP Plan update patch is empty'
      USING ERRCODE = '22023';
  END IF;

  -- A false presence flag has exactly one representation: a null value.
  -- Explicit null remains meaningful only for note and tag removal.
  IF (p_title_present AND p_title IS NULL)
    OR (NOT p_title_present AND p_title IS NOT NULL)
    OR (NOT p_note_present AND p_note IS NOT NULL)
    OR (NOT p_tag_id_present AND p_tag_id IS NOT NULL)
    OR (p_start_at_present AND p_start_at IS NULL)
    OR (NOT p_start_at_present AND p_start_at IS NOT NULL)
    OR (p_end_at_present AND p_end_at IS NULL)
    OR (NOT p_end_at_present AND p_end_at IS NOT NULL) THEN
    RAISE EXCEPTION 'MCP Plan update patch shape is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF NOT pg_catalog.isfinite(p_expected_updated_at)
    OR (p_start_at_present AND NOT pg_catalog.isfinite(p_start_at))
    OR (p_end_at_present AND NOT pg_catalog.isfinite(p_end_at)) THEN
    RAISE EXCEPTION 'MCP Plan update timestamps must be finite'
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
    'write:plans'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  -- Key presence is part of the public request. Omitted fields are preserved;
  -- explicit null clears note or tag. Internal source/calendar bindings are not
  -- public mutation inputs and therefore are not included in this digest.
  v_normalized_args := pg_catalog.jsonb_build_object(
    'planId', p_plan_id,
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
    'plans.update'::TEXT,
    v_normalized_args
  );

  SELECT replay_receipt.*
  INTO v_receipt
  FROM private.resolve_mcp_mutation_replay_v1(
    v_user_id,
    v_client_id,
    p_operation_id,
    'plans.update'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'plan'::TEXT
  ) AS replay_receipt;

  v_decision_at := pg_catalog.clock_timestamp();
  IF v_authority_expires_at <= v_decision_at THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_id IS DISTINCT FROM p_plan_id
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

  -- Expand the partial patch while holding the same Plan row lock that normal
  -- UI commands use. Source and external-calendar binding always pass through.
  SELECT plan.*
  INTO v_existing
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = v_user_id
    AND plan.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;

  -- The Plan lock itself can wait after authorization. Recheck the wall-clock
  -- deadline before invoking the authoritative domain command.
  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  SELECT plan.*
  INTO v_plan
  FROM public.update_plan_command_v1(
    v_user_id,
    p_plan_id,
    p_expected_updated_at,
    CASE WHEN p_title_present THEN p_title ELSE v_existing.title END,
    CASE WHEN p_note_present THEN p_note ELSE v_existing.note END,
    CASE WHEN p_tag_id_present THEN p_tag_id ELSE v_existing.tag_id END,
    v_existing.external_calendar_event_id,
    CASE WHEN p_start_at_present THEN p_start_at ELSE v_existing.start_at END,
    CASE WHEN p_end_at_present THEN p_end_at ELSE v_existing.end_at END
  ) AS plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  -- The domain command can wait on tag or overlap locks after the Plan lock.
  -- Rechecking here makes an expired authority roll back both the Plan update
  -- and the receipt in this same transaction.
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
    'plans.update',
    v_request_digest,
    'plan',
    v_plan.id,
    v_plan.updated_at,
    v_plan.deleted_at
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

REVOKE ALL ON FUNCTION public.apply_mcp_plan_update_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, UUID,
  BOOLEAN, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_plan_update_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, UUID,
  BOOLEAN, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.apply_mcp_plan_update_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, UUID,
  BOOLEAN, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) IS
  'Applies one authorized partial MCP Plan update and its immutable receipt atomically.';

-- =============================================================================
-- 2. Plan delete
-- =============================================================================

CREATE FUNCTION public.apply_mcp_plan_delete_v1(
  p_connection_id UUID,
  p_access_token_id UUID,
  p_operation_id UUID,
  p_plan_id UUID,
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
  v_plan public.plans%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_plan_id IS NULL
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'MCP Plan delete input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT pg_catalog.isfinite(p_expected_updated_at) THEN
    RAISE EXCEPTION 'MCP Plan delete timestamp must be finite'
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
    'delete:plans'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'plans.delete'::TEXT,
    pg_catalog.jsonb_build_object(
      'planId', p_plan_id,
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
    'plans.delete'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'plan'::TEXT
  ) AS replay_receipt;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_id IS DISTINCT FROM p_plan_id
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

  SELECT plan.*
  INTO v_plan
  FROM public.delete_plan_command_v1(
    v_user_id,
    p_plan_id,
    p_expected_updated_at
  ) AS plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  -- The row lock is acquired inside the shared command. If that wait crosses
  -- the authority deadline, raising here rolls the deletion back atomically.
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
    'plans.delete',
    v_request_digest,
    'plan',
    v_plan.id,
    v_plan.updated_at,
    v_plan.deleted_at
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

REVOKE ALL ON FUNCTION public.apply_mcp_plan_delete_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_plan_delete_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.apply_mcp_plan_delete_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) IS
  'Applies one authorized MCP Plan deletion and its immutable receipt atomically.';

-- =============================================================================
-- 3. Plan restore
-- =============================================================================

CREATE FUNCTION public.apply_mcp_plan_restore_v1(
  p_connection_id UUID,
  p_access_token_id UUID,
  p_operation_id UUID,
  p_plan_id UUID,
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
  v_plan public.plans%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_plan_id IS NULL
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'MCP Plan restore input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT pg_catalog.isfinite(p_expected_updated_at) THEN
    RAISE EXCEPTION 'MCP Plan restore timestamp must be finite'
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
    'delete:plans'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'plans.restore'::TEXT,
    pg_catalog.jsonb_build_object(
      'planId', p_plan_id,
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
    'plans.restore'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'plan'::TEXT
  ) AS replay_receipt;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_id IS DISTINCT FROM p_plan_id
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

  SELECT plan.*
  INTO v_plan
  FROM public.restore_plan_command_v1(
    v_user_id,
    p_plan_id,
    p_expected_updated_at
  ) AS plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  -- Restore can wait on both its Plan row and the overlap exclusion check.
  -- Expiry after either wait must roll back the restore before any receipt.
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
    'plans.restore',
    v_request_digest,
    'plan',
    v_plan.id,
    v_plan.updated_at,
    v_plan.deleted_at
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

REVOKE ALL ON FUNCTION public.apply_mcp_plan_restore_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_plan_restore_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.apply_mcp_plan_restore_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ
) IS
  'Applies one authorized MCP Plan restoration and its immutable receipt atomically.';
