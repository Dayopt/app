-- MCP write foundation: bind every new OAuth grant and token family to a
-- stable connection and one canonical protected resource.
--
-- This migration remains compatible with the currently deployed read-only
-- token endpoint: connection_id is nullable only for legacy read-only rows.
-- Any row carrying a write/delete scope must have a connection binding.

-- =============================================================================
-- 1. Stable authorization grants / refresh families
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Recheck while holding write-blocking locks in the same transaction that
-- changes the OAuth tables. This closes the gap where the old app could insert
-- a grant after the check but before the compatibility trigger exists.
LOCK TABLE
  public.oauth_authorization_codes,
  public.oauth_tokens
IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oauth_authorization_codes)
    OR EXISTS (SELECT 1 FROM public.oauth_tokens) THEN
    RAISE EXCEPTION
      'Legacy OAuth rows must be drained before MCP Stage 1'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TABLE public.oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL
    CHECK (client_id IN ('claude-ai', 'chatgpt', 'cursor', 'unknown')),
  resource_uri TEXT NOT NULL
    CHECK (resource_uri = 'https://mcp.dayopt.app'),
  scopes TEXT[] NOT NULL,
  consent_version INTEGER NOT NULL DEFAULT 1
    CHECK (consent_version > 0),
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  last_used_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  reauth_required_at TIMESTAMPTZ NOT NULL
    DEFAULT (pg_catalog.now() + INTERVAL '90 days'),
  write_enabled_at TIMESTAMPTZ,
  legacy_read_only BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT oauth_connections_scope_set CHECK (
    cardinality(scopes) > 0
    AND scopes <@ ARRAY[
      'read:entries',
      'read:tags',
      'read:constraints',
      'read:stats',
      'write:plans',
      'delete:plans',
      'write:records',
      'delete:records'
    ]::TEXT[]
  ),
  CONSTRAINT oauth_connections_reauth_after_authorization CHECK (
    reauth_required_at > authorized_at
  ),
  CONSTRAINT oauth_connections_revocation_shape CHECK (
    (revoked_at IS NULL AND revoked_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)
  ),
  CONSTRAINT oauth_connections_write_gate CHECK (
    write_enabled_at IS NOT NULL
    OR NOT (
      scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    )
  ),
  CONSTRAINT oauth_connections_binding_key
    UNIQUE (id, user_id, client_id, resource_uri)
);

COMMENT ON TABLE public.oauth_connections IS
  'OAuth authorization grant and refresh-token family for one Dayopt MCP connection.';
COMMENT ON COLUMN public.oauth_connections.write_enabled_at IS
  'Closed-beta write gate. Write/delete scopes are invalid while this is null.';
COMMENT ON COLUMN public.oauth_connections.legacy_read_only IS
  'Read-only grant synthesized for a token/code created before stable connections existed.';

ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own oauth connections"
  ON public.oauth_connections
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.oauth_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.oauth_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oauth_connections TO service_role;

CREATE INDEX oauth_connections_user_authorized_idx
  ON public.oauth_connections (user_id, authorized_at DESC);
CREATE INDEX oauth_connections_active_client_idx
  ON public.oauth_connections (user_id, client_id, resource_uri)
  WHERE revoked_at IS NULL;
CREATE INDEX oauth_connections_reauth_idx
  ON public.oauth_connections (reauth_required_at)
  WHERE revoked_at IS NULL;

CREATE TRIGGER trigger_update_oauth_connections_updated_at
  BEFORE UPDATE ON public.oauth_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- 2. Bind codes and tokens to resource + connection
-- =============================================================================

ALTER TABLE public.oauth_authorization_codes
  ADD COLUMN connection_id UUID,
  ADD COLUMN resource_uri TEXT NOT NULL DEFAULT 'https://mcp.dayopt.app';

ALTER TABLE public.oauth_tokens
  ADD COLUMN connection_id UUID,
  ADD COLUMN resource_uri TEXT NOT NULL DEFAULT 'https://mcp.dayopt.app';

-- Preserve any token/code created before this migration as read-only. The
-- production schema had no rows at review time, but the backfill keeps deploy
-- ordering safe if a connection is created before migration application.
WITH legacy_grants AS (
  SELECT user_id, client_id, scopes, created_at, last_used_at
  FROM public.oauth_tokens
  UNION ALL
  SELECT
    user_id,
    client_id,
    scopes,
    created_at,
    NULL::TIMESTAMPTZ AS last_used_at
  FROM public.oauth_authorization_codes
),
legacy_scope_rows AS (
  SELECT
    grant_row.user_id,
    grant_row.client_id,
    scope_row.scope,
    grant_row.created_at,
    grant_row.last_used_at
  FROM legacy_grants AS grant_row
  CROSS JOIN LATERAL unnest(grant_row.scopes) AS scope_row(scope)
),
legacy_connections AS (
  SELECT
    user_id,
    client_id,
    array_agg(DISTINCT scope ORDER BY scope) AS scopes,
    min(created_at) AS authorized_at,
    max(last_used_at) AS last_used_at
  FROM legacy_scope_rows
  WHERE scope = ANY (ARRAY['read:entries', 'read:tags', 'read:stats']::TEXT[])
  GROUP BY user_id, client_id
)
INSERT INTO public.oauth_connections (
  user_id,
  client_id,
  resource_uri,
  scopes,
  authorized_at,
  last_used_at,
  reauth_required_at,
  legacy_read_only
)
SELECT
  user_id,
  client_id,
  'https://mcp.dayopt.app',
  scopes,
  authorized_at,
  last_used_at,
  pg_catalog.now() + INTERVAL '90 days',
  true
FROM legacy_connections;

UPDATE public.oauth_tokens AS token
SET connection_id = connection.id
FROM public.oauth_connections AS connection
WHERE token.connection_id IS NULL
  AND connection.legacy_read_only
  AND connection.user_id = token.user_id
  AND connection.client_id = token.client_id
  AND connection.resource_uri = token.resource_uri;

UPDATE public.oauth_authorization_codes AS code
SET connection_id = connection.id
FROM public.oauth_connections AS connection
WHERE code.connection_id IS NULL
  AND connection.legacy_read_only
  AND connection.user_id = code.user_id
  AND connection.client_id = code.client_id
  AND connection.resource_uri = code.resource_uri;

-- Install the legacy writer bridge in the first externally visible OAuth
-- migration. The old server does not provide connection_id, so waiting for a
-- later migration would allow an unbound code or token to be committed between
-- migration transactions.
CREATE FUNCTION public.bind_legacy_oauth_insert_to_connection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_connection_id UUID;
  v_parent_exists BOOLEAN := false;
  v_candidate_connections UUID[];
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.connection_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.resource_uri IS DISTINCT FROM 'https://mcp.dayopt.app' THEN
    RAISE EXCEPTION 'Invalid OAuth resource'
      USING ERRCODE = '22023';
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

CREATE TRIGGER trigger_bind_legacy_oauth_code_connection
  BEFORE INSERT ON public.oauth_authorization_codes
  FOR EACH ROW
  WHEN (NEW.connection_id IS NULL)
  EXECUTE FUNCTION public.bind_legacy_oauth_insert_to_connection();

CREATE TRIGGER trigger_bind_legacy_oauth_token_connection
  BEFORE INSERT ON public.oauth_tokens
  FOR EACH ROW
  WHEN (NEW.connection_id IS NULL)
  EXECUTE FUNCTION public.bind_legacy_oauth_insert_to_connection();

ALTER TABLE public.oauth_tokens
  ADD CONSTRAINT oauth_tokens_resource_uri_check
    CHECK (resource_uri = 'https://mcp.dayopt.app'),
  ADD CONSTRAINT oauth_tokens_supported_scopes_check
    CHECK (
      cardinality(scopes) > 0
      AND scopes <@ ARRAY[
        'read:entries',
        'read:tags',
        'read:constraints',
        'read:stats',
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    ),
  ADD CONSTRAINT oauth_tokens_connection_required_check
    CHECK (connection_id IS NOT NULL),
  ADD CONSTRAINT oauth_tokens_connection_binding_fkey
    FOREIGN KEY (connection_id, user_id, client_id, resource_uri)
    REFERENCES public.oauth_connections (id, user_id, client_id, resource_uri)
    ON DELETE CASCADE;

ALTER TABLE public.oauth_authorization_codes
  ADD CONSTRAINT oauth_authorization_codes_resource_uri_check
    CHECK (resource_uri = 'https://mcp.dayopt.app'),
  ADD CONSTRAINT oauth_authorization_codes_supported_scopes_check
    CHECK (
      cardinality(scopes) > 0
      AND scopes <@ ARRAY[
        'read:entries',
        'read:tags',
        'read:constraints',
        'read:stats',
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    ),
  ADD CONSTRAINT oauth_authorization_codes_connection_required_check
    CHECK (connection_id IS NOT NULL),
  ADD CONSTRAINT oauth_authorization_codes_connection_binding_fkey
    FOREIGN KEY (connection_id, user_id, client_id, resource_uri)
    REFERENCES public.oauth_connections (id, user_id, client_id, resource_uri)
    ON DELETE CASCADE;

CREATE INDEX oauth_tokens_connection_idx
  ON public.oauth_tokens (connection_id, token_type, created_at DESC);
CREATE INDEX oauth_authorization_codes_connection_idx
  ON public.oauth_authorization_codes (connection_id, expires_at);

-- The OAuth tables are service-owned. Browser users may only inspect their
-- own connection/token/audit metadata through RLS.
REVOKE ALL ON TABLE public.oauth_authorization_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.oauth_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.oauth_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.oauth_tokens TO authenticated;
GRANT SELECT ON TABLE public.oauth_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oauth_authorization_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oauth_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oauth_audit_log TO service_role;

-- =============================================================================
-- 3. Atomic grant/code/token operations
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
AS $$
DECLARE
  v_connection_id UUID;
  v_has_write_scope BOOLEAN;
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

  IF v_has_write_scope AND NOT p_write_enabled THEN
    RAISE EXCEPTION 'OAuth write scope is not enabled for this connection'
      USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.exchange_oauth_authorization_code_v2(
  p_code_hash TEXT,
  p_client_id TEXT,
  p_redirect_uri TEXT,
  p_resource_uri TEXT,
  p_code_challenge TEXT,
  p_refresh_hash TEXT,
  p_access_hash TEXT,
  p_refresh_expires_at TIMESTAMPTZ,
  p_access_expires_at TIMESTAMPTZ
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

  UPDATE public.oauth_authorization_codes AS code
  SET consumed_at = pg_catalog.now()
  WHERE code.code_hash = p_code_hash
    AND code.consumed_at IS NULL
    AND code.expires_at > pg_catalog.now()
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
    OR v_connection.reauth_required_at <= pg_catalog.now()
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

  v_access_expires_at := LEAST(p_access_expires_at, v_connection.reauth_required_at);

  INSERT INTO public.oauth_tokens (
    user_id,
    token_hash,
    token_type,
    client_id,
    scopes,
    expires_at,
    parent_token_id,
    connection_id,
    resource_uri
  ) VALUES (
    v_code.user_id,
    p_refresh_hash,
    'refresh',
    v_code.client_id,
    v_code.scopes,
    LEAST(p_refresh_expires_at, v_connection.reauth_required_at),
    NULL,
    v_connection.id,
    v_connection.resource_uri
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
    connection_id,
    resource_uri
  ) VALUES (
    v_code.user_id,
    p_access_hash,
    'access',
    v_code.client_id,
    v_code.scopes,
    v_access_expires_at,
    v_refresh_id,
    v_connection.id,
    v_connection.resource_uri
  )
  RETURNING id INTO v_access_id;

  UPDATE public.oauth_connections
  SET last_refreshed_at = pg_catalog.now(),
      last_used_at = pg_catalog.now()
  WHERE id = v_connection.id;

  RETURN QUERY SELECT
    v_code.user_id,
    v_connection.id,
    v_code.client_id,
    v_code.resource_uri,
    v_code.scopes,
    v_refresh_id,
    v_access_id,
    v_access_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_oauth_refresh_token_v2(
  p_refresh_hash TEXT,
  p_client_id TEXT,
  p_resource_uri TEXT,
  p_new_refresh_hash TEXT,
  p_new_access_hash TEXT,
  p_refresh_expires_at TIMESTAMPTZ,
  p_access_expires_at TIMESTAMPTZ
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

  SELECT token.*
  INTO v_token
  FROM public.oauth_tokens AS token
  WHERE token.token_hash = p_refresh_hash
    AND token.token_type = 'refresh'
  FOR UPDATE;

  IF NOT FOUND
    OR v_token.client_id IS DISTINCT FROM p_client_id
    OR v_token.resource_uri IS DISTINCT FROM p_resource_uri
    OR v_token.connection_id IS NULL THEN
    RETURN QUERY SELECT
      'invalid_grant'::TEXT,
      NULL::UUID,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT[],
      NULL::UUID,
      NULL::UUID,
      NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT connection.*
  INTO v_connection
  FROM public.oauth_connections AS connection
  WHERE connection.id = v_token.connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'invalid_grant'::TEXT,
      NULL::UUID,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT[],
      NULL::UUID,
      NULL::UUID,
      NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_token.revoked_at IS NOT NULL THEN
    UPDATE public.oauth_connections
    SET revoked_at = COALESCE(revoked_at, pg_catalog.now()),
        revoked_reason = COALESCE(revoked_reason, 'refresh_token_reuse')
    WHERE id = v_connection.id;

    UPDATE public.oauth_tokens
    SET revoked_at = COALESCE(revoked_at, pg_catalog.now())
    WHERE connection_id = v_connection.id;

    RETURN QUERY SELECT
      'reuse_detected'::TEXT,
      v_connection.user_id,
      v_connection.id,
      v_connection.client_id,
      v_connection.resource_uri,
      NULL::TEXT[],
      NULL::UUID,
      NULL::UUID,
      NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_token.expires_at <= pg_catalog.now()
    OR v_connection.revoked_at IS NOT NULL
    OR v_connection.reauth_required_at <= pg_catalog.now()
    OR COALESCE(v_connection.last_refreshed_at, v_connection.authorized_at)
      + INTERVAL '30 days' <= pg_catalog.now() THEN
    RETURN QUERY SELECT
      'invalid_grant'::TEXT,
      v_connection.user_id,
      v_connection.id,
      v_connection.client_id,
      v_connection.resource_uri,
      NULL::TEXT[],
      NULL::UUID,
      NULL::UUID,
      NULL::TIMESTAMPTZ;
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
      'invalid_grant'::TEXT,
      v_connection.user_id,
      v_connection.id,
      v_connection.client_id,
      v_connection.resource_uri,
      NULL::TEXT[],
      NULL::UUID,
      NULL::UUID,
      NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  UPDATE public.oauth_tokens
  SET revoked_at = pg_catalog.now()
  WHERE id = v_token.id;

  v_access_expires_at := LEAST(p_access_expires_at, v_connection.reauth_required_at);

  INSERT INTO public.oauth_tokens (
    user_id,
    token_hash,
    token_type,
    client_id,
    scopes,
    expires_at,
    parent_token_id,
    connection_id,
    resource_uri
  ) VALUES (
    v_token.user_id,
    p_new_refresh_hash,
    'refresh',
    v_token.client_id,
    v_effective_scopes,
    LEAST(p_refresh_expires_at, v_connection.reauth_required_at),
    v_token.id,
    v_connection.id,
    v_connection.resource_uri
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
    connection_id,
    resource_uri
  ) VALUES (
    v_token.user_id,
    p_new_access_hash,
    'access',
    v_token.client_id,
    v_effective_scopes,
    v_access_expires_at,
    v_refresh_id,
    v_connection.id,
    v_connection.resource_uri
  )
  RETURNING id INTO v_access_id;

  UPDATE public.oauth_connections
  SET last_refreshed_at = pg_catalog.now(),
      last_used_at = pg_catalog.now()
  WHERE id = v_connection.id;

  RETURN QUERY SELECT
    'issued'::TEXT,
    v_token.user_id,
    v_connection.id,
    v_connection.client_id,
    v_connection.resource_uri,
    v_effective_scopes,
    v_refresh_id,
    v_access_id,
    v_access_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_oauth_connection(p_connection_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_connection_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT connection.id
  INTO v_connection_id
  FROM public.oauth_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.oauth_connections
  SET revoked_at = COALESCE(revoked_at, pg_catalog.now()),
      revoked_reason = COALESCE(revoked_reason, 'user_revoked')
  WHERE id = v_connection_id;

  UPDATE public.oauth_tokens
  SET revoked_at = COALESCE(revoked_at, pg_catalog.now())
  WHERE connection_id = v_connection_id;

  RETURN true;
END;
$$;

-- Every privileged function is deny-by-default. The first three are only
-- reachable from the server's narrowed service-role client. Revocation is an
-- authenticated user action and re-checks auth.uid() inside the function.
REVOKE ALL ON FUNCTION public.create_oauth_authorization_grant_v2(
  UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_oauth_authorization_grant_v2(
  UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, BOOLEAN
) TO service_role;

REVOKE ALL ON FUNCTION public.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION public.revoke_oauth_connection(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_oauth_connection(UUID) TO authenticated, service_role;

COMMIT;
