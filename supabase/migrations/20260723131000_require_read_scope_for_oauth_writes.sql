-- Keep the protected-resource step-up contract and stored OAuth grants aligned:
-- every write/delete capability extends the generally available read:entries
-- grant instead of replacing it.

DO $$
DECLARE
  v_write_scopes CONSTANT TEXT[] := ARRAY[
    'write:plans',
    'delete:plans',
    'write:records',
    'delete:records'
  ]::TEXT[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.oauth_connections
    WHERE scopes && v_write_scopes
      AND NOT ('read:entries' = ANY (scopes))
  ) OR EXISTS (
    SELECT 1
    FROM public.oauth_authorization_codes
    WHERE scopes && v_write_scopes
      AND NOT ('read:entries' = ANY (scopes))
  ) OR EXISTS (
    SELECT 1
    FROM public.oauth_tokens
    WHERE scopes && v_write_scopes
      AND NOT ('read:entries' = ANY (scopes))
  ) THEN
    RAISE EXCEPTION
      'OAuth write scopes without read:entries must be revoked before this migration'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

ALTER TABLE public.oauth_connections
  ADD CONSTRAINT oauth_connections_write_requires_read_entries_check
  CHECK (
    NOT (
      scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    )
    OR 'read:entries' = ANY (scopes)
  );

ALTER TABLE public.oauth_authorization_codes
  ADD CONSTRAINT oauth_authorization_codes_write_requires_read_entries_check
  CHECK (
    NOT (
      scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    )
    OR 'read:entries' = ANY (scopes)
  );

ALTER TABLE public.oauth_tokens
  ADD CONSTRAINT oauth_tokens_write_requires_read_entries_check
  CHECK (
    NOT (
      scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    )
    OR 'read:entries' = ANY (scopes)
  );

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

  IF v_has_write_scope AND NOT ('read:entries' = ANY (p_scopes)) THEN
    RAISE EXCEPTION 'OAuth write scopes require read:entries'
      USING ERRCODE = '22023';
  END IF;

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

REVOKE ALL ON FUNCTION public.create_oauth_authorization_grant_v2(
  UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_oauth_authorization_grant_v2(
  UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, BOOLEAN
) TO service_role;
