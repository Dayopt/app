-- First typed MCP mutation: create one Plan and its completed idempotency
-- receipt in the same transaction. No MCP write tool is registered here and
-- the durable global mutation control remains OFF by default.

-- =============================================================================
-- 1. Shared private authorization and receipt helpers
-- =============================================================================

CREATE FUNCTION private.authorize_mcp_mutation_v1(
  p_connection_id UUID,
  p_access_token_id UUID,
  p_required_scope TEXT,
  p_operation_id UUID
)
RETURNS TABLE(
  user_id UUID,
  client_id TEXT,
  authorized_at TIMESTAMPTZ,
  authority_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_writes_enabled BOOLEAN;
  v_candidate_user_id UUID;
  v_connection public.oauth_connections%ROWTYPE;
  v_token public.oauth_tokens%ROWTYPE;
  v_subscription_status TEXT;
  v_now TIMESTAMPTZ;
  v_authority_expires_at TIMESTAMPTZ;
BEGIN
  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_required_scope IS NULL
    OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'MCP mutation authorization input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF p_required_scope <> ALL (ARRAY[
    'write:plans',
    'delete:plans',
    'write:records',
    'delete:records'
  ]::TEXT[]) THEN
    RAISE EXCEPTION 'Unsupported MCP mutation scope'
      USING ERRCODE = '22023';
  END IF;

  -- Global stop is the first lock and therefore the outermost linearization
  -- boundary for every mutation.
  SELECT control.writes_enabled
  INTO v_writes_enabled
  FROM public.mcp_mutation_control AS control
  WHERE control.singleton_key = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP mutation control is missing'
      USING ERRCODE = 'DM002';
  END IF;

  IF NOT v_writes_enabled THEN
    RAISE EXCEPTION 'MCP writes are disabled'
      USING ERRCODE = 'DM003';
  END IF;

  -- Resolve the FK parent without taking a child lock, then establish the
  -- parent -> connection -> token -> profile order used by every apply. This
  -- matches auth.admin.deleteUser() and prevents a parent/child deadlock when
  -- the Plan and receipt later acquire auth.users FK locks.
  SELECT connection.user_id
  INTO v_candidate_user_id
  FROM public.oauth_connections AS connection
  WHERE connection.id = p_connection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = v_candidate_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  SELECT connection.*
  INTO v_connection
  FROM public.oauth_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = v_candidate_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  SELECT token.*
  INTO v_token
  FROM public.oauth_tokens AS token
  WHERE token.id = p_access_token_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  SELECT profile.subscription_status
  INTO v_subscription_status
  FROM public.profiles AS profile
  WHERE profile.id = v_connection.user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP Pro entitlement is required'
      USING ERRCODE = 'DM005';
  END IF;

  PERFORM private.lock_mcp_mutation_operation_v1(
    v_connection.user_id,
    v_connection.client_id,
    p_operation_id
  );

  -- Locks preserve row state, but token and reauthorization deadlines can pass
  -- while waiting for the operation lock. Validate against wall-clock time only
  -- after that wait and return the deadline for one final post-receipt check.
  v_now := pg_catalog.clock_timestamp();
  v_authority_expires_at := LEAST(v_token.expires_at, v_connection.reauth_required_at);

  IF v_connection.client_id <> ALL (ARRAY['claude-ai', 'chatgpt', 'cursor']::TEXT[])
    OR v_connection.resource_uri IS DISTINCT FROM 'https://mcp.dayopt.app'
    OR v_connection.legacy_read_only
    OR v_connection.revoked_at IS NOT NULL
    OR v_connection.write_enabled_at IS NULL
    OR NOT (p_required_scope = ANY (v_connection.scopes))
    OR v_token.token_type IS DISTINCT FROM 'access'
    OR v_token.connection_id IS DISTINCT FROM v_connection.id
    OR v_token.user_id IS DISTINCT FROM v_connection.user_id
    OR v_token.client_id IS DISTINCT FROM v_connection.client_id
    OR v_token.resource_uri IS DISTINCT FROM v_connection.resource_uri
    OR v_token.revoked_at IS NOT NULL
    OR NOT (p_required_scope = ANY (v_token.scopes))
    OR v_authority_expires_at <= v_now THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF v_subscription_status <> ALL (ARRAY['active', 'trialing', 'past_due']::TEXT[]) THEN
    RAISE EXCEPTION 'MCP Pro entitlement is required'
      USING ERRCODE = 'DM005';
  END IF;

  RETURN QUERY SELECT
    v_connection.user_id,
    v_connection.client_id,
    v_now,
    v_authority_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION private.authorize_mcp_mutation_v1(UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.digest_mcp_mutation_envelope_v1(
  p_tool_name TEXT,
  p_normalized_args JSONB
)
RETURNS BYTEA
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT pg_catalog.sha256(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'envelopeVersion', 1,
        'toolName', p_tool_name,
        'normalizedArgs', p_normalized_args
      )::TEXT,
      'UTF8'
    )
  );
$$;

REVOKE ALL ON FUNCTION private.digest_mcp_mutation_envelope_v1(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.resolve_mcp_mutation_replay_v1(
  p_user_id UUID,
  p_client_id TEXT,
  p_operation_id UUID,
  p_tool_name TEXT,
  p_request_digest BYTEA,
  p_envelope_version SMALLINT,
  p_resource_type TEXT
)
RETURNS SETOF public.mcp_mutation_receipts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cutoff CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp() - INTERVAL '90 days';
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
BEGIN
  SELECT receipt.*
  INTO v_receipt
  FROM public.mcp_mutation_receipts AS receipt
  WHERE receipt.user_id = p_user_id
    AND receipt.client_id = p_client_id
    AND receipt.operation_id = p_operation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_receipt.applied_at < v_cutoff THEN
    DELETE FROM public.mcp_mutation_receipts AS receipt
    WHERE receipt.user_id = p_user_id
      AND receipt.client_id = p_client_id
      AND receipt.operation_id = p_operation_id;
    RETURN;
  END IF;

  IF v_receipt.tool_name IS DISTINCT FROM p_tool_name
    OR v_receipt.request_digest IS DISTINCT FROM p_request_digest THEN
    RAISE EXCEPTION 'MCP operation ID was reused for a different request'
      USING ERRCODE = 'DM006';
  END IF;

  IF v_receipt.envelope_version IS DISTINCT FROM p_envelope_version
    OR v_receipt.resource_type IS DISTINCT FROM p_resource_type THEN
    RAISE EXCEPTION 'MCP mutation receipt invariant failed'
      USING ERRCODE = 'DM007';
  END IF;

  RETURN NEXT v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_mcp_mutation_replay_v1(
  UUID, TEXT, UUID, TEXT, BYTEA, SMALLINT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

-- Receipt time is the actual completion wall clock, not the transaction start.
-- Preserve the only allowed update: FK-owned origin connection detach.
CREATE OR REPLACE FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.origin_connection_id IS NOT NULL
      AND NEW.origin_connection_id IS NULL
      AND ROW(
        NEW.user_id,
        NEW.client_id,
        NEW.operation_id,
        NEW.envelope_version,
        NEW.tool_name,
        NEW.request_digest,
        NEW.resource_type,
        NEW.resource_id,
        NEW.resource_version,
        NEW.resource_deleted_at,
        NEW.applied_at
      ) IS NOT DISTINCT FROM ROW(
        OLD.user_id,
        OLD.client_id,
        OLD.operation_id,
        OLD.envelope_version,
        OLD.tool_name,
        OLD.request_digest,
        OLD.resource_type,
        OLD.resource_id,
        OLD.resource_version,
        OLD.resource_deleted_at,
        OLD.applied_at
      ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'MCP mutation receipts are immutable'
      USING ERRCODE = '23514';
  END IF;

  NEW.applied_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1()
  FROM PUBLIC, anon, authenticated, service_role;

-- =============================================================================
-- 2. Typed Plan create apply boundary
-- =============================================================================

CREATE FUNCTION public.apply_mcp_plan_create_v1(
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
  v_authorized_at TIMESTAMPTZ;
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
    auth_result.authorized_at,
    auth_result.authority_expires_at
  INTO v_user_id, v_client_id, v_authorized_at, v_authority_expires_at
  FROM private.authorize_mcp_mutation_v1(
    p_connection_id,
    p_access_token_id,
    'write:plans',
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'plans.create',
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
    'plans.create',
    v_request_digest,
    1,
    'plan'
  ) AS replay_receipt;

  -- Expired-receipt deletion can wait behind a connection FK detach. Only
  -- wall-clock authority can change while the authorization rows stay locked,
  -- so recheck the returned deadline after receipt resolution.
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
    'api',
    p_start_at,
    p_end_at
  ) AS plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan command returned no row'
      USING ERRCODE = 'P0002';
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
  'Creates one API-sourced Plan and a payload-free completed MCP mutation receipt atomically. Callable only by service_role.';
