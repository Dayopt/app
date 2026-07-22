-- Harden OAuth token exchange and rotation before the connection-bound flow is
-- exposed to clients.
--
-- Security properties:
--   * token lifetimes are authored by the database, not by the API process;
--   * every flow locks connection -> token, matching connection revocation;
--   * a parallel refresh inside the grace window does not revoke the winning
--     token family, while reuse after the grace window revokes the connection;
--   * plaintext replacement tokens are never persisted, so a lost successful
--     response requires reconnecting instead of replaying a stored secret.

ALTER TABLE public.oauth_tokens
  ADD COLUMN rotated_at TIMESTAMPTZ,
  ADD CONSTRAINT oauth_tokens_rotation_shape CHECK (
    rotated_at IS NULL
    OR (token_type = 'refresh' AND revoked_at IS NOT NULL)
  );

COMMENT ON COLUMN public.oauth_tokens.rotated_at IS
  'Normal refresh-token rotation time. Distinct from administrative/family revocation.';

DROP FUNCTION public.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
);

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

DROP FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
);

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

  -- First resolve the owning connection without a token lock. Every mutation
  -- then follows the global connection -> token lock order.
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
      -- Likely parallel client retry: preserve the winner. Since plaintext
      -- replacement tokens are never stored, this response remains a generic
      -- invalid grant and a lost winner response requires reconnection.
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

REVOKE ALL ON FUNCTION public.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_oauth_authorization_code_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;
