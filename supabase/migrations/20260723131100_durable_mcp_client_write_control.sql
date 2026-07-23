-- Add a durable, client-specific MCP write gate. The runtime environment
-- allowlist remains a rollout preflight, but database state is authoritative
-- for both new grants and in-flight mutation authorization.

ALTER TABLE public.mcp_mutation_control
  ADD COLUMN enabled_client_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD CONSTRAINT mcp_mutation_control_enabled_clients_valid CHECK (
    array_position(enabled_client_ids, NULL) IS NULL
    AND enabled_client_ids <@ ARRAY['claude-ai', 'chatgpt', 'cursor']::TEXT[]
  );

COMMENT ON COLUMN public.mcp_mutation_control.enabled_client_ids IS
  'Clients allowed to receive and exercise MCP write scopes. Disabled clients require a new authorization after re-enable.';

CREATE FUNCTION public.set_mcp_client_write_control_v1(
  p_client_id TEXT,
  p_enabled BOOLEAN,
  p_expected_revision BIGINT
)
RETURNS TABLE(
  enabled_client_ids TEXT[],
  revision BIGINT,
  changed_at TIMESTAMPTZ,
  disabled_connection_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_control public.mcp_mutation_control%ROWTYPE;
  v_disabled_connection_count BIGINT := 0;
  v_changed_at TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_client_id IS NULL
    OR p_client_id <> ALL (ARRAY['claude-ai', 'chatgpt', 'cursor']::TEXT[])
    OR p_enabled IS NULL
    OR p_expected_revision IS NULL
    OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'Invalid MCP client write control input'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.mcp_mutation_control AS control
  SET enabled_client_ids = CASE
        WHEN p_enabled AND NOT (p_client_id = ANY (control.enabled_client_ids))
          THEN pg_catalog.array_append(control.enabled_client_ids, p_client_id)
        WHEN NOT p_enabled
          THEN pg_catalog.array_remove(control.enabled_client_ids, p_client_id)
        ELSE control.enabled_client_ids
      END,
      revision = control.revision + 1,
      changed_at = v_changed_at
  WHERE control.singleton_key = true
    AND control.revision = p_expected_revision
  RETURNING control.* INTO v_control;

  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.mcp_mutation_control AS control
      WHERE control.singleton_key = true
    ) THEN
      RAISE EXCEPTION 'MCP mutation control is missing'
        USING ERRCODE = 'DM002';
    END IF;

    RAISE EXCEPTION 'MCP mutation control revision is stale'
      USING ERRCODE = 'DM001';
  END IF;

  IF NOT p_enabled THEN
    UPDATE public.oauth_connections AS connection
    SET write_disabled_at = COALESCE(connection.write_disabled_at, v_changed_at)
    WHERE connection.client_id = p_client_id
      AND connection.write_enabled_at IS NOT NULL
      AND connection.write_disabled_at IS NULL;

    GET DIAGNOSTICS v_disabled_connection_count = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT
    v_control.enabled_client_ids,
    v_control.revision,
    v_control.changed_at,
    v_disabled_connection_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_mcp_client_write_control_v1(TEXT, BOOLEAN, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_mcp_client_write_control_v1(TEXT, BOOLEAN, BIGINT)
  TO service_role;

COMMENT ON FUNCTION public.set_mcp_client_write_control_v1(TEXT, BOOLEAN, BIGINT) IS
  'CAS update for one durable MCP client write gate. Disabling also irreversibly disables existing write connections.';

CREATE OR REPLACE FUNCTION public.create_oauth_authorization_grant_v2(
  p_user_id UUID,
  p_client_id TEXT,
  p_resource_uri TEXT,
  p_scopes TEXT[],
  p_code_hash TEXT,
  p_redirect_uri TEXT,
  p_code_challenge TEXT,
  p_write_enabled BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_connection_id UUID;
  v_has_write_scope BOOLEAN;
  v_enabled_client_ids TEXT[];
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_resource_uri IS DISTINCT FROM 'https://mcp.dayopt.app' THEN
    RAISE EXCEPTION 'Invalid OAuth resource'
      USING ERRCODE = '22023';
  END IF;

  IF p_client_id <> ALL (ARRAY['claude-ai', 'chatgpt', 'cursor']::TEXT[]) THEN
    RAISE EXCEPTION 'Invalid OAuth client'
      USING ERRCODE = '22023';
  END IF;

  IF cardinality(p_scopes) = 0
    OR NOT (
      p_scopes <@ ARRAY[
        'read:entries',
        'read:tags',
        'read:constraints',
        'read:stats',
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    ) THEN
    RAISE EXCEPTION 'Invalid OAuth scope set'
      USING ERRCODE = '22023';
  END IF;

  v_has_write_scope := p_scopes && ARRAY[
    'write:plans',
    'delete:plans',
    'write:records',
    'delete:records'
  ]::TEXT[];

  IF v_has_write_scope AND NOT ('read:entries' = ANY (p_scopes)) THEN
    RAISE EXCEPTION 'OAuth write scopes require read:entries'
      USING ERRCODE = '22023';
  END IF;

  IF v_has_write_scope AND p_write_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OAuth write scope is not enabled for this connection'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_has_write_scope AND p_write_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'OAuth read-only scope cannot enable writes'
      USING ERRCODE = '22023';
  END IF;

  IF v_has_write_scope THEN
    SELECT control.enabled_client_ids
    INTO v_enabled_client_ids
    FROM public.mcp_mutation_control AS control
    WHERE control.singleton_key = true
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MCP mutation control is missing'
        USING ERRCODE = 'DM002';
    END IF;

    IF NOT (p_client_id = ANY (v_enabled_client_ids)) THEN
      RAISE EXCEPTION 'MCP writes are disabled for this client'
        USING ERRCODE = 'DM003';
    END IF;
  END IF;

  INSERT INTO public.oauth_connections (
    user_id,
    client_id,
    resource_uri,
    scopes,
    write_enabled_at
  ) VALUES (
    p_user_id,
    p_client_id,
    p_resource_uri,
    p_scopes,
    CASE WHEN p_write_enabled THEN pg_catalog.now() ELSE NULL END
  )
  RETURNING id INTO v_connection_id;

  INSERT INTO public.oauth_authorization_codes (
    code_hash,
    user_id,
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    scopes,
    connection_id,
    resource_uri
  ) VALUES (
    p_code_hash,
    p_user_id,
    p_client_id,
    p_redirect_uri,
    p_code_challenge,
    'S256',
    p_scopes,
    v_connection_id,
    p_resource_uri
  );

  RETURN v_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_oauth_authorization_grant_v2(
  UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_oauth_authorization_grant_v2(
  UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, BOOLEAN
) TO service_role;

CREATE OR REPLACE FUNCTION private.authorize_mcp_mutation_v1(
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
  v_enabled_client_ids TEXT[];
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

  SELECT control.writes_enabled, control.enabled_client_ids
  INTO v_writes_enabled, v_enabled_client_ids
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

  PERFORM private.lock_timeblock_user_write_shared_v1(v_candidate_user_id);

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

  IF NOT (v_connection.client_id = ANY (v_enabled_client_ids)) THEN
    RAISE EXCEPTION 'MCP writes are disabled for this client'
      USING ERRCODE = 'DM003';
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

  v_now := pg_catalog.clock_timestamp();
  v_authority_expires_at := LEAST(v_token.expires_at, v_connection.reauth_required_at);

  IF v_connection.client_id <> ALL (ARRAY['claude-ai', 'chatgpt', 'cursor']::TEXT[])
    OR v_connection.resource_uri IS DISTINCT FROM 'https://mcp.dayopt.app'
    OR v_connection.legacy_read_only
    OR v_connection.revoked_at IS NOT NULL
    OR v_connection.write_enabled_at IS NULL
    OR v_connection.write_disabled_at IS NOT NULL
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
