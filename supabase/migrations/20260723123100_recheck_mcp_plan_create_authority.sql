-- A create command can wait on the Plan overlap exclusion constraint after
-- the initial authorization decision. Recheck the wall-clock authority after
-- the command and before the receipt so expiry rolls the whole transaction
-- back instead of committing a mutation under stale authority.

CREATE OR REPLACE FUNCTION public.apply_mcp_plan_create_v1(
  p_connection_id UUID,
  p_access_token_id UUID,
  p_operation_id UUID,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
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
  v_decision_at TIMESTAMPTZ;
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
    OR p_start_at IS NULL
    OR p_end_at IS NULL THEN
    RAISE EXCEPTION 'MCP Plan create input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT pg_catalog.isfinite(p_start_at) OR NOT pg_catalog.isfinite(p_end_at) THEN
    RAISE EXCEPTION 'MCP Plan timestamps must be finite'
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

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'plans.create'::TEXT,
    pg_catalog.jsonb_build_object(
      'title', p_title,
      'note', p_note,
      'tagId', p_tag_id,
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
    'plans.create'::TEXT,
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

  -- Replay is intentionally resolved before current domain validation so a
  -- completed historical call remains replayable after time or tag changes.
  IF p_end_at <= v_decision_at THEN
    RAISE EXCEPTION 'Plans must end in the future'
      USING ERRCODE = 'DT004';
  END IF;

  SELECT plan.*
  INTO v_plan
  FROM public.create_plan_command_v1(
    v_user_id,
    p_title,
    p_note,
    p_tag_id,
    NULL::UUID,
    'api'::TEXT,
    p_start_at,
    p_end_at
  ) AS plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan command returned no row'
      USING ERRCODE = 'P0002';
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
    'plans.create',
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

REVOKE ALL ON FUNCTION public.apply_mcp_plan_create_v1(
  UUID, UUID, UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_plan_create_v1(
  UUID, UUID, UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.apply_mcp_plan_create_v1(
  UUID, UUID, UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) IS
  'Applies one authorized MCP Plan creation and receipt atomically, with post-command authority expiry rollback.';
