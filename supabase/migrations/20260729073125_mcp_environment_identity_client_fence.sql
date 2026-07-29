-- Final Stage 1 authority fence. One immutable database identity owns every
-- OAuth resource, while both global and client-specific MCP write gates remain
-- closed by default. No HTTP/runtime write surface is enabled here.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. Immutable Production / ephemeral Preview identity
-- =============================================================================

CREATE TABLE public.mcp_environment_identity (
  singleton_key BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton_key),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'preview')),
  authorization_server_uri TEXT NOT NULL,
  resource_uri TEXT NOT NULL,
  supabase_project_ref TEXT,
  provisioned_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT mcp_environment_identity_tuple_check CHECK (
    (
      environment = 'production'
      AND authorization_server_uri = 'https://app.dayopt.app'
      AND resource_uri = 'https://mcp.dayopt.app'
      AND supabase_project_ref IS NULL
    )
    OR
    (
      environment = 'preview'
      AND authorization_server_uri = resource_uri
      AND authorization_server_uri
        ~ '^https://product-git-[a-z0-9-]+-dayopt[.]vercel[.]app$'
      AND supabase_project_ref ~ '^[a-z]{20}$'
    )
  ),
  CONSTRAINT mcp_environment_identity_resource_uri_key UNIQUE (resource_uri)
);

-- An established database is Production. A fresh PR Preview remains
-- unprovisioned until its exact Vercel URL and Supabase ref are bound through
-- the service-role-only insert-once RPC below.
INSERT INTO public.mcp_environment_identity (
  singleton_key,
  environment,
  authorization_server_uri,
  resource_uri
)
SELECT
  true,
  'production',
  'https://app.dayopt.app',
  'https://mcp.dayopt.app'
WHERE EXISTS (SELECT 1 FROM auth.users)
  OR EXISTS (SELECT 1 FROM public.oauth_connections)
  OR EXISTS (SELECT 1 FROM public.oauth_authorization_codes)
  OR EXISTS (SELECT 1 FROM public.oauth_tokens)
  OR EXISTS (SELECT 1 FROM public.oauth_audit_log)
  OR EXISTS (SELECT 1 FROM public.mcp_mutation_receipts);

COMMENT ON TABLE public.mcp_environment_identity IS
  'Immutable singleton OAuth authorization-server and MCP resource identity owned by this database.';
COMMENT ON COLUMN public.mcp_environment_identity.supabase_project_ref IS
  'Exact Supabase project ref bound to an ephemeral Preview identity. NULL for established Production.';

ALTER TABLE public.mcp_environment_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mcp_environment_identity
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.prevent_mcp_environment_identity_change_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'MCP environment identity is immutable'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_mcp_environment_identity_change_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trigger_prevent_mcp_environment_identity_change
  BEFORE UPDATE OR DELETE ON public.mcp_environment_identity
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_mcp_environment_identity_change_v1();

CREATE FUNCTION private.get_mcp_environment_resource_uri_v1()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_resource_uri TEXT;
BEGIN
  SELECT identity.resource_uri
  INTO v_resource_uri
  FROM public.mcp_environment_identity AS identity
  WHERE identity.singleton_key = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP environment identity is missing'
      USING ERRCODE = 'DI001';
  END IF;

  RETURN v_resource_uri;
END;
$$;

REVOKE ALL ON FUNCTION private.get_mcp_environment_resource_uri_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.require_mcp_environment_resource_v1(p_resource_uri TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resource_uri TEXT;
BEGIN
  v_resource_uri := private.get_mcp_environment_resource_uri_v1();

  IF p_resource_uri IS DISTINCT FROM v_resource_uri THEN
    RAISE EXCEPTION 'Invalid OAuth resource'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_resource_uri;
END;
$$;

REVOKE ALL ON FUNCTION private.require_mcp_environment_resource_v1(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_mcp_environment_identity_v1()
RETURNS TABLE(
  environment TEXT,
  authorization_server_uri TEXT,
  resource_uri TEXT,
  supabase_project_ref TEXT,
  provisioned_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    identity.environment,
    identity.authorization_server_uri,
    identity.resource_uri,
    identity.supabase_project_ref,
    identity.provisioned_at
  FROM public.mcp_environment_identity AS identity
  WHERE identity.singleton_key = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP environment identity is missing'
      USING ERRCODE = 'DI001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_mcp_environment_identity_v1()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mcp_environment_identity_v1()
  TO service_role;

CREATE FUNCTION public.provision_mcp_preview_environment_identity_v1(
  p_authorization_server_uri TEXT,
  p_resource_uri TEXT,
  p_supabase_project_ref TEXT
)
RETURNS TABLE(
  environment TEXT,
  authorization_server_uri TEXT,
  resource_uri TEXT,
  supabase_project_ref TEXT,
  provisioned_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_identity public.mcp_environment_identity%ROWTYPE;
  v_control public.mcp_mutation_control%ROWTYPE;
  v_jwt_project_ref TEXT;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  v_jwt_project_ref := auth.jwt() ->> 'ref';
  IF v_jwt_project_ref IS NULL
    OR v_jwt_project_ref IS DISTINCT FROM p_supabase_project_ref THEN
    RAISE EXCEPTION 'MCP Preview Supabase project binding is unavailable'
      USING ERRCODE = 'DI007';
  END IF;

  IF p_authorization_server_uri IS DISTINCT FROM p_resource_uri
    OR p_authorization_server_uri
      !~ '^https://product-git-[a-z0-9-]+-dayopt[.]vercel[.]app$'
    OR p_supabase_project_ref !~ '^[a-z]{20}$' THEN
    RAISE EXCEPTION 'Invalid MCP Preview environment identity'
      USING ERRCODE = '22023';
  END IF;

  LOCK TABLE public.mcp_environment_identity IN EXCLUSIVE MODE;

  SELECT identity.*
  INTO v_identity
  FROM public.mcp_environment_identity AS identity
  WHERE identity.singleton_key = true;

  IF FOUND THEN
    IF v_identity.environment = 'preview'
      AND v_identity.authorization_server_uri = p_authorization_server_uri
      AND v_identity.resource_uri = p_resource_uri
      AND v_identity.supabase_project_ref = p_supabase_project_ref THEN
      RETURN QUERY SELECT
        v_identity.environment,
        v_identity.authorization_server_uri,
        v_identity.resource_uri,
        v_identity.supabase_project_ref,
        v_identity.provisioned_at;
      RETURN;
    END IF;

    RAISE EXCEPTION 'MCP environment identity is already provisioned'
      USING ERRCODE = 'DI002';
  END IF;

  SELECT control.*
  INTO v_control
  FROM public.mcp_mutation_control AS control
  WHERE control.singleton_key = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP mutation control is missing'
      USING ERRCODE = 'DI003';
  END IF;

  IF v_control.writes_enabled
    OR COALESCE(pg_catalog.cardinality(v_control.enabled_client_ids), 0) <> 0 THEN
    RAISE EXCEPTION 'MCP environment identity requires closed write gates'
      USING ERRCODE = 'DI004';
  END IF;

  -- These locks make the data-less proof and identity insert one atomic fence.
  LOCK TABLE auth.users IN SHARE MODE;
  LOCK TABLE public.oauth_connections IN SHARE MODE;
  LOCK TABLE public.oauth_authorization_codes IN SHARE MODE;
  LOCK TABLE public.oauth_tokens IN SHARE MODE;
  LOCK TABLE public.oauth_audit_log IN SHARE MODE;
  LOCK TABLE public.mcp_mutation_receipts IN SHARE MODE;

  IF EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'Preview MCP identity requires a data-less database'
      USING ERRCODE = 'DI005';
  END IF;

  IF EXISTS (SELECT 1 FROM public.oauth_connections)
    OR EXISTS (SELECT 1 FROM public.oauth_authorization_codes)
    OR EXISTS (SELECT 1 FROM public.oauth_tokens)
    OR EXISTS (SELECT 1 FROM public.oauth_audit_log)
    OR EXISTS (SELECT 1 FROM public.mcp_mutation_receipts) THEN
    RAISE EXCEPTION 'MCP environment identity cannot follow existing authority'
      USING ERRCODE = 'DI006';
  END IF;

  INSERT INTO public.mcp_environment_identity (
    singleton_key,
    environment,
    authorization_server_uri,
    resource_uri,
    supabase_project_ref
  ) VALUES (
    true,
    'preview',
    p_authorization_server_uri,
    p_resource_uri,
    p_supabase_project_ref
  )
  RETURNING * INTO v_identity;

  RETURN QUERY SELECT
    v_identity.environment,
    v_identity.authorization_server_uri,
    v_identity.resource_uri,
    v_identity.supabase_project_ref,
    v_identity.provisioned_at;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_mcp_preview_environment_identity_v1(
  TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provision_mcp_preview_environment_identity_v1(
  TEXT, TEXT, TEXT
) TO service_role;

-- =============================================================================
-- 2. Every OAuth authority row references the database identity
-- =============================================================================

ALTER TABLE public.oauth_connections
  DROP CONSTRAINT IF EXISTS oauth_connections_resource_uri_check,
  ADD CONSTRAINT oauth_connections_environment_resource_fkey
    FOREIGN KEY (resource_uri)
    REFERENCES public.mcp_environment_identity (resource_uri)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT;

ALTER TABLE public.oauth_authorization_codes
  ALTER COLUMN resource_uri DROP DEFAULT,
  ALTER COLUMN resource_uri DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS oauth_authorization_codes_resource_uri_check,
  ADD CONSTRAINT oauth_authorization_codes_resource_required_check
    CHECK (resource_uri IS NOT NULL),
  ADD CONSTRAINT oauth_authorization_codes_environment_resource_fkey
    FOREIGN KEY (resource_uri)
    REFERENCES public.mcp_environment_identity (resource_uri)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT;

ALTER TABLE public.oauth_tokens
  ALTER COLUMN resource_uri DROP DEFAULT,
  ALTER COLUMN resource_uri DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS oauth_tokens_resource_uri_check,
  ADD CONSTRAINT oauth_tokens_resource_required_check
    CHECK (resource_uri IS NOT NULL),
  ADD CONSTRAINT oauth_tokens_environment_resource_fkey
    FOREIGN KEY (resource_uri)
    REFERENCES public.mcp_environment_identity (resource_uri)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT;

-- The old app omits resource_uri and connection_id. Resolve the immutable
-- resource first, then preserve one connection from consumed code through root
-- refresh and child access inserts. Ambiguous parallel old flows fail closed.
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
  v_candidate_connections UUID[];
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

  -- PL/pgSQL resolves NEW fields against the trigger relation before boolean
  -- short-circuiting. Keep oauth_tokens-only fields in this nested branch.
  IF TG_TABLE_NAME = 'oauth_tokens' THEN
    IF NEW.parent_token_id IS NOT NULL THEN
      SELECT parent.connection_id, true
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
    ELSIF NEW.token_type = 'refresh' THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          NEW.user_id::TEXT || ':' || NEW.client_id || ':' || NEW.resource_uri,
          6174413826609021
        )
      );

      SELECT pg_catalog.array_agg(candidate.connection_id)
      INTO v_candidate_connections
      FROM (
        SELECT code.connection_id
        FROM public.oauth_authorization_codes AS code
        JOIN public.oauth_connections AS connection
          ON connection.id = code.connection_id
        WHERE code.user_id = NEW.user_id
          AND code.client_id = NEW.client_id
          AND code.resource_uri = NEW.resource_uri
          AND code.scopes = NEW.scopes
          AND code.consumed_at IS NOT NULL
          AND code.consumed_at >= pg_catalog.now() - INTERVAL '5 minutes'
          AND connection.legacy_read_only
          AND connection.revoked_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.oauth_tokens AS family_token
            WHERE family_token.connection_id = connection.id
          )
        GROUP BY code.connection_id
        ORDER BY max(code.consumed_at) DESC
        LIMIT 2
      ) AS candidate;

      IF COALESCE(pg_catalog.cardinality(v_candidate_connections), 0) > 1 THEN
        RAISE EXCEPTION 'Legacy OAuth code binding is ambiguous'
          USING ERRCODE = '23514';
      END IF;

      v_connection_id := v_candidate_connections[1];
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

-- The browser never needs token hashes. Preserve owner metadata reads while
-- keeping the stored credential verifier out of authenticated column grants.
REVOKE SELECT ON TABLE public.oauth_tokens FROM authenticated;
GRANT SELECT (
  id,
  user_id,
  connection_id,
  token_type,
  client_id,
  resource_uri,
  scopes,
  expires_at,
  revoked_at,
  rotated_at,
  parent_token_id,
  last_used_at,
  created_at
) ON TABLE public.oauth_tokens TO authenticated;

-- =============================================================================
-- 3. Durable client fence, default empty
-- =============================================================================

ALTER TABLE public.mcp_mutation_control
  ADD COLUMN enabled_client_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD CONSTRAINT mcp_mutation_control_enabled_clients_valid CHECK (
    array_position(enabled_client_ids, NULL) IS NULL
    AND enabled_client_ids <@ ARRAY['claude-ai', 'chatgpt', 'cursor']::TEXT[]
  );

COMMENT ON COLUMN public.mcp_mutation_control.enabled_client_ids IS
  'Clients allowed to receive and exercise MCP write scopes. Empty is the Stage 1 rollout stop condition.';

CREATE FUNCTION public.set_mcp_client_write_control_v1(
  p_client_id TEXT,
  p_enabled BOOLEAN,
  p_expected_revision BIGINT
)
RETURNS TABLE(
  enabled_client_ids TEXT[],
  revision BIGINT,
  changed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_control public.mcp_mutation_control%ROWTYPE;
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
      changed_at = pg_catalog.now()
  WHERE control.singleton_key = true
    AND control.revision = p_expected_revision
  RETURNING control.* INTO v_control;

  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.mcp_mutation_control WHERE singleton_key = true
    ) THEN
      RAISE EXCEPTION 'MCP mutation control is missing'
        USING ERRCODE = 'DM002';
    END IF;
    RAISE EXCEPTION 'MCP mutation control revision is stale'
      USING ERRCODE = 'DM001';
  END IF;

  RETURN QUERY SELECT
    v_control.enabled_client_ids,
    v_control.revision,
    v_control.changed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.set_mcp_client_write_control_v1(TEXT, BOOLEAN, BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_mcp_client_write_control_v1(TEXT, BOOLEAN, BIGINT)
  TO service_role;

-- =============================================================================
-- 4. Identity-first grant, exchange, rotation, and apply authorization
-- =============================================================================

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
SET lock_timeout = '5s'
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
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

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

-- Keep the proven exchange/rotation implementations private and put the
-- immutable identity check before any code consumption or family mutation.
ALTER FUNCTION public.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.exchange_oauth_authorization_code_v2(
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
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_mcp_environment_resource_v1(p_resource_uri);

  RETURN QUERY
  SELECT exchange_result.*
  FROM private.exchange_oauth_authorization_code_v2(
    p_code_hash,
    p_client_id,
    p_redirect_uri,
    p_resource_uri,
    p_code_challenge,
    p_refresh_hash,
    p_access_hash
  ) AS exchange_result;
END;
$$;

REVOKE ALL ON FUNCTION public.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

ALTER FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.rotate_oauth_refresh_token_v2(
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
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_mcp_environment_resource_v1(p_resource_uri);

  RETURN QUERY
  SELECT rotation_result.*
  FROM private.rotate_oauth_refresh_token_v2(
    p_refresh_hash,
    p_client_id,
    p_resource_uri,
    p_new_refresh_hash,
    p_new_access_hash
  ) AS rotation_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
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
    OR NOT (p_required_scope = ANY (v_connection.scopes))
    OR v_token.token_type IS DISTINCT FROM 'access'
    OR v_token.connection_id IS DISTINCT FROM v_connection.id
    OR v_token.user_id IS DISTINCT FROM v_connection.user_id
    OR v_token.client_id IS DISTINCT FROM v_connection.client_id
    OR v_token.resource_uri IS DISTINCT FROM v_resource_uri
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

COMMIT;
