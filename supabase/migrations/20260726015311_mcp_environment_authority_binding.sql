-- Bind every OAuth grant, code, token, and MCP mutation to the immutable
-- identity owned by this database. Identity is locked before all other OAuth
-- mutation locks so provisioning and authority creation cannot race.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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

  PERFORM private.require_mcp_environment_resource_v1(p_resource_uri);

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
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_oauth_authorization_grant_v2(
  UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, BOOLEAN
) TO service_role;

CREATE OR REPLACE FUNCTION public.exchange_oauth_authorization_code_v2(
  p_code_hash TEXT,
  p_client_id TEXT,
  p_redirect_uri TEXT,
  p_resource_uri TEXT,
  p_code_challenge TEXT,
  p_refresh_hash TEXT,
  p_access_hash TEXT
)
RETURNS TABLE(
  user_id UUID,
  connection_id UUID,
  client_id TEXT,
  resource_uri TEXT,
  scopes TEXT[],
  refresh_id UUID,
  access_id UUID,
  access_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.now();
  v_code public.oauth_authorization_codes%ROWTYPE;
  v_connection public.oauth_connections%ROWTYPE;
  v_refresh_id UUID;
  v_access_id UUID;
  v_access_expires_at TIMESTAMPTZ;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  -- This must precede code consumption. A wrong deployment/resource leaves the
  -- authorization code untouched for a correct retry.
  PERFORM private.require_mcp_environment_resource_v1(p_resource_uri);

  UPDATE public.oauth_authorization_codes AS code
  SET consumed_at = v_now
  WHERE code.code_hash = p_code_hash
    AND code.consumed_at IS NULL
    AND code.expires_at > v_now
    AND code.client_id = p_client_id
    AND code.redirect_uri = p_redirect_uri
    AND code.resource_uri = p_resource_uri
    AND code.code_challenge = p_code_challenge
    AND code.connection_id IS NOT NULL
  RETURNING code.* INTO v_code;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT connection.*
  INTO v_connection
  FROM public.oauth_connections AS connection
  WHERE connection.id = v_code.connection_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_connection.user_id IS DISTINCT FROM v_code.user_id
    OR v_connection.client_id IS DISTINCT FROM v_code.client_id
    OR v_connection.resource_uri IS DISTINCT FROM v_code.resource_uri
    OR v_connection.revoked_at IS NOT NULL
    OR v_connection.reauth_required_at <= v_now
    OR NOT (v_code.scopes <@ v_connection.scopes)
    OR (
      v_code.scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
      AND v_connection.write_enabled_at IS NULL
    ) THEN
    RETURN;
  END IF;

  v_access_expires_at := LEAST(
    v_now + INTERVAL '5 minutes',
    v_connection.reauth_required_at
  );

  INSERT INTO public.oauth_tokens (
    user_id, token_hash, token_type, client_id, scopes, expires_at,
    parent_token_id, connection_id, resource_uri
  ) VALUES (
    v_code.user_id, p_refresh_hash, 'refresh', v_code.client_id,
    v_code.scopes,
    LEAST(v_now + INTERVAL '30 days', v_connection.reauth_required_at),
    NULL, v_connection.id, v_connection.resource_uri
  )
  RETURNING id INTO v_refresh_id;

  INSERT INTO public.oauth_tokens (
    user_id, token_hash, token_type, client_id, scopes, expires_at,
    parent_token_id, connection_id, resource_uri
  ) VALUES (
    v_code.user_id, p_access_hash, 'access', v_code.client_id,
    v_code.scopes, v_access_expires_at, v_refresh_id, v_connection.id,
    v_connection.resource_uri
  )
  RETURNING id INTO v_access_id;

  UPDATE public.oauth_connections
  SET last_refreshed_at = v_now,
      last_used_at = v_now
  WHERE id = v_connection.id;

  RETURN QUERY SELECT
    v_code.user_id, v_connection.id, v_code.client_id,
    v_code.resource_uri, v_code.scopes, v_refresh_id, v_access_id,
    v_access_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.rotate_oauth_refresh_token_v2(
  p_refresh_hash TEXT,
  p_client_id TEXT,
  p_resource_uri TEXT,
  p_new_refresh_hash TEXT,
  p_new_access_hash TEXT
)
RETURNS TABLE(
  status TEXT,
  user_id UUID,
  connection_id UUID,
  client_id TEXT,
  resource_uri TEXT,
  scopes TEXT[],
  refresh_id UUID,
  access_id UUID,
  access_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.now();
  v_rotation_grace CONSTANT INTERVAL := INTERVAL '30 seconds';
  v_token_id UUID;
  v_connection_id UUID;
  v_token public.oauth_tokens%ROWTYPE;
  v_connection public.oauth_connections%ROWTYPE;
  v_effective_scopes TEXT[];
  v_refresh_id UUID;
  v_access_id UUID;
  v_access_expires_at TIMESTAMPTZ;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  -- This must precede lookup and reuse handling. A wrong resource can never
  -- rotate or revoke a refresh family.
  PERFORM private.require_mcp_environment_resource_v1(p_resource_uri);

  SELECT token.id, token.connection_id
  INTO v_token_id, v_connection_id
  FROM public.oauth_tokens AS token
  WHERE token.token_hash = p_refresh_hash
    AND token.token_type = 'refresh'
    AND token.client_id = p_client_id
    AND token.resource_uri = p_resource_uri;

  IF NOT FOUND OR v_connection_id IS NULL THEN
    RETURN QUERY SELECT
      'invalid_grant'::TEXT, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT,
      NULL::TEXT[], NULL::UUID, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT connection.*
  INTO v_connection
  FROM public.oauth_connections AS connection
  WHERE connection.id = v_connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'invalid_grant'::TEXT, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT,
      NULL::TEXT[], NULL::UUID, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT token.*
  INTO v_token
  FROM public.oauth_tokens AS token
  WHERE token.id = v_token_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_token.connection_id IS DISTINCT FROM v_connection.id
    OR v_token.user_id IS DISTINCT FROM v_connection.user_id
    OR v_token.client_id IS DISTINCT FROM v_connection.client_id
    OR v_token.resource_uri IS DISTINCT FROM v_connection.resource_uri
    OR v_connection.client_id IS DISTINCT FROM p_client_id
    OR v_connection.resource_uri IS DISTINCT FROM p_resource_uri
    OR v_connection.revoked_at IS NOT NULL
    OR v_connection.reauth_required_at <= v_now
    OR v_token.expires_at <= v_now
    OR COALESCE(v_connection.last_refreshed_at, v_connection.authorized_at)
      + INTERVAL '30 days' <= v_now THEN
    RETURN QUERY SELECT
      'invalid_grant'::TEXT, v_connection.user_id, v_connection.id,
      v_connection.client_id, v_connection.resource_uri, NULL::TEXT[],
      NULL::UUID, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_token.rotated_at IS NOT NULL THEN
    IF v_token.rotated_at + v_rotation_grace >= v_now THEN
      RETURN QUERY SELECT
        'retryable_duplicate'::TEXT, v_connection.user_id, v_connection.id,
        v_connection.client_id, v_connection.resource_uri, NULL::TEXT[],
        NULL::UUID, NULL::UUID, NULL::TIMESTAMPTZ;
      RETURN;
    END IF;

    UPDATE public.oauth_connections
    SET revoked_at = COALESCE(revoked_at, v_now),
        revoked_reason = COALESCE(revoked_reason, 'refresh_token_reuse')
    WHERE id = v_connection.id;

    UPDATE public.oauth_tokens AS family_token
    SET revoked_at = COALESCE(family_token.revoked_at, v_now)
    WHERE family_token.connection_id = v_connection.id;

    RETURN QUERY SELECT
      'reuse_detected'::TEXT, v_connection.user_id, v_connection.id,
      v_connection.client_id, v_connection.resource_uri, NULL::TEXT[],
      NULL::UUID, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_token.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT
      'invalid_grant'::TEXT, v_connection.user_id, v_connection.id,
      v_connection.client_id, v_connection.resource_uri, NULL::TEXT[],
      NULL::UUID, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT array_agg(scope ORDER BY scope)
  INTO v_effective_scopes
  FROM (
    SELECT DISTINCT scope
    FROM unnest(v_token.scopes) AS scope
    WHERE scope = ANY (v_connection.scopes)
  ) AS effective;

  IF COALESCE(cardinality(v_effective_scopes), 0) = 0
    OR (
      v_effective_scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
      AND v_connection.write_enabled_at IS NULL
    ) THEN
    RETURN QUERY SELECT
      'invalid_grant'::TEXT, v_connection.user_id, v_connection.id,
      v_connection.client_id, v_connection.resource_uri, NULL::TEXT[],
      NULL::UUID, NULL::UUID, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  UPDATE public.oauth_tokens
  SET revoked_at = v_now,
      rotated_at = v_now
  WHERE id = v_token.id;

  v_access_expires_at := LEAST(
    v_now + INTERVAL '5 minutes',
    v_connection.reauth_required_at
  );

  INSERT INTO public.oauth_tokens (
    user_id, token_hash, token_type, client_id, scopes, expires_at,
    parent_token_id, connection_id, resource_uri
  ) VALUES (
    v_token.user_id, p_new_refresh_hash, 'refresh', v_token.client_id,
    v_effective_scopes,
    LEAST(v_now + INTERVAL '30 days', v_connection.reauth_required_at),
    v_token.id, v_connection.id, v_connection.resource_uri
  )
  RETURNING id INTO v_refresh_id;

  INSERT INTO public.oauth_tokens (
    user_id, token_hash, token_type, client_id, scopes, expires_at,
    parent_token_id, connection_id, resource_uri
  ) VALUES (
    v_token.user_id, p_new_access_hash, 'access', v_token.client_id,
    v_effective_scopes, v_access_expires_at, v_refresh_id, v_connection.id,
    v_connection.resource_uri
  )
  RETURNING id INTO v_access_id;

  UPDATE public.oauth_connections
  SET last_refreshed_at = v_now,
      last_used_at = v_now
  WHERE id = v_connection.id;

  RETURN QUERY SELECT
    'issued'::TEXT, v_token.user_id, v_connection.id,
    v_connection.client_id, v_connection.resource_uri, v_effective_scopes,
    v_refresh_id, v_access_id, v_access_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.bind_legacy_oauth_insert_to_connection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resource_uri TEXT;
  v_connection_id UUID;
  v_parent_exists BOOLEAN := false;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  v_resource_uri := private.get_mcp_environment_resource_uri_v1();

  IF NEW.resource_uri IS NULL THEN
    NEW.resource_uri := v_resource_uri;
  ELSIF NEW.resource_uri IS DISTINCT FROM v_resource_uri THEN
    RAISE EXCEPTION 'Invalid OAuth resource'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.connection_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.scopes && ARRAY[
    'write:plans',
    'delete:plans',
    'write:records',
    'delete:records'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'Legacy OAuth insert cannot carry write scopes'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'oauth_tokens' AND NEW.parent_token_id IS NOT NULL THEN
    SELECT
      parent.connection_id,
      true
    INTO v_connection_id, v_parent_exists
    FROM public.oauth_tokens AS parent
    JOIN public.oauth_connections AS connection
      ON connection.id = parent.connection_id
    WHERE parent.id = NEW.parent_token_id
      AND parent.user_id = NEW.user_id
      AND parent.client_id = NEW.client_id
      AND parent.resource_uri = NEW.resource_uri
      AND NEW.scopes <@ connection.scopes;

    IF NOT v_parent_exists THEN
      RAISE EXCEPTION 'OAuth parent token binding is invalid'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  IF v_connection_id IS NULL THEN
    INSERT INTO public.oauth_connections (
      user_id,
      client_id,
      resource_uri,
      scopes,
      legacy_read_only
    ) VALUES (
      NEW.user_id,
      NEW.client_id,
      NEW.resource_uri,
      NEW.scopes,
      true
    )
    RETURNING id INTO v_connection_id;
  END IF;

  NEW.connection_id := v_connection_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bind_legacy_oauth_insert_to_connection()
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the old signature during the Production drain window, but remove
-- its former PUBLIC/search_path/default-resource bypasses. The replacement is
-- read-only, connection-bound, identity-bound, and DB-authors both TTLs.
CREATE OR REPLACE FUNCTION public.issue_oauth_token_pair(
  p_user_id UUID,
  p_client_id TEXT,
  p_scopes TEXT[],
  p_refresh_hash TEXT,
  p_access_hash TEXT,
  p_refresh_expires_at TIMESTAMPTZ,
  p_access_expires_at TIMESTAMPTZ,
  p_parent_refresh_id UUID DEFAULT NULL
)
RETURNS TABLE(refresh_id UUID, access_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.now();
  v_resource_uri TEXT;
  v_refresh_id UUID;
  v_access_id UUID;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  v_resource_uri := private.get_mcp_environment_resource_uri_v1();

  IF p_client_id <> ALL (
    ARRAY['claude-ai', 'chatgpt', 'cursor', 'unknown']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Invalid OAuth client'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(cardinality(p_scopes), 0) = 0
    OR NOT (
      p_scopes <@ ARRAY[
        'read:entries',
        'read:tags',
        'read:constraints',
        'read:stats'
      ]::TEXT[]
    ) THEN
    RAISE EXCEPTION 'Legacy OAuth token pair must be read-only'
      USING ERRCODE = '42501';
  END IF;

  -- Retain the parameters for signature compatibility without trusting
  -- process-authored expiries.
  PERFORM p_refresh_expires_at, p_access_expires_at;

  INSERT INTO public.oauth_tokens (
    user_id,
    token_hash,
    token_type,
    client_id,
    scopes,
    expires_at,
    parent_token_id,
    resource_uri
  ) VALUES (
    p_user_id,
    p_refresh_hash,
    'refresh',
    p_client_id,
    p_scopes,
    v_now + INTERVAL '30 days',
    p_parent_refresh_id,
    v_resource_uri
  )
  RETURNING id INTO v_refresh_id;

  INSERT INTO public.oauth_tokens (
    user_id,
    token_hash,
    token_type,
    client_id,
    scopes,
    expires_at,
    parent_token_id,
    resource_uri
  ) VALUES (
    p_user_id,
    p_access_hash,
    'access',
    p_client_id,
    p_scopes,
    v_now + INTERVAL '5 minutes',
    v_refresh_id,
    v_resource_uri
  )
  RETURNING id INTO v_access_id;

  RETURN QUERY SELECT v_refresh_id, v_access_id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_oauth_token_pair(
  UUID, TEXT, TEXT[], TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_oauth_token_pair(
  UUID, TEXT, TEXT[], TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID
) TO service_role;

COMMENT ON FUNCTION public.issue_oauth_token_pair(
  UUID, TEXT, TEXT[], TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID
) IS
  'Temporary read-only compatibility issuer. Remove only after old Production callers are proven drained.';

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
SET lock_timeout = '5s'
AS $$
DECLARE
  v_resource_uri TEXT;
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

  BEGIN
    v_resource_uri := private.get_mcp_environment_resource_uri_v1();
  EXCEPTION WHEN SQLSTATE 'DI001' THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END;

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

  BEGIN
    PERFORM private.lock_timeblock_user_write_shared_v1(v_candidate_user_id);
  EXCEPTION WHEN SQLSTATE 'DT001' THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END;

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
    OR v_connection.resource_uri IS DISTINCT FROM v_resource_uri
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

REVOKE ALL ON FUNCTION private.authorize_mcp_mutation_v1(
  UUID, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.authorize_mcp_mutation_v1(
  UUID, UUID, TEXT, UUID
) IS
  'Revalidates immutable DB identity and MCP mutation authority under the common user-write boundary.';

-- Direct service-role DML is still constrained to the database-owned resource.
-- The connection/code/token composite FKs continue to enforce family binding.
ALTER TABLE public.oauth_connections
  ADD CONSTRAINT oauth_connections_environment_resource_fkey
  FOREIGN KEY (resource_uri)
  REFERENCES public.mcp_environment_identity (resource_uri)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.oauth_authorization_codes
  ADD CONSTRAINT oauth_authorization_codes_environment_resource_fkey
  FOREIGN KEY (resource_uri)
  REFERENCES public.mcp_environment_identity (resource_uri)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.oauth_tokens
  ADD CONSTRAINT oauth_tokens_environment_resource_fkey
  FOREIGN KEY (resource_uri)
  REFERENCES public.mcp_environment_identity (resource_uri)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.oauth_connections
  VALIDATE CONSTRAINT oauth_connections_environment_resource_fkey;
ALTER TABLE public.oauth_authorization_codes
  VALIDATE CONSTRAINT oauth_authorization_codes_environment_resource_fkey;
ALTER TABLE public.oauth_tokens
  VALIDATE CONSTRAINT oauth_tokens_environment_resource_fkey;

ALTER TABLE public.oauth_connections
  DROP CONSTRAINT oauth_connections_resource_uri_check;

ALTER TABLE public.oauth_authorization_codes
  DROP CONSTRAINT oauth_authorization_codes_resource_uri_check,
  ALTER COLUMN resource_uri DROP DEFAULT;

ALTER TABLE public.oauth_tokens
  DROP CONSTRAINT oauth_tokens_resource_uri_check,
  ALTER COLUMN resource_uri DROP DEFAULT;

COMMIT;
