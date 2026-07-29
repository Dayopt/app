-- Keep the OAuth deployment gap fail-closed and connection-bound.
--
-- The currently deployed read-only server does not write connection_id. These
-- triggers bind any short-lived legacy insert during migration -> app cutover,
-- while the connection-required CHECK makes unbound grants impossible without
-- changing the generated Insert type. Write scopes are never accepted through
-- this compatibility path.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.bind_legacy_oauth_insert_to_connection()
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

  IF TG_TABLE_NAME = 'oauth_tokens' THEN
    IF NEW.parent_token_id IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS trigger_bind_legacy_oauth_code_connection
  ON public.oauth_authorization_codes;
CREATE TRIGGER trigger_bind_legacy_oauth_code_connection
  BEFORE INSERT ON public.oauth_authorization_codes
  FOR EACH ROW
  WHEN (NEW.connection_id IS NULL)
  EXECUTE FUNCTION public.bind_legacy_oauth_insert_to_connection();

DROP TRIGGER IF EXISTS trigger_bind_legacy_oauth_token_connection
  ON public.oauth_tokens;
CREATE TRIGGER trigger_bind_legacy_oauth_token_connection
  BEFORE INSERT ON public.oauth_tokens
  FOR EACH ROW
  WHEN (NEW.connection_id IS NULL)
  EXECUTE FUNCTION public.bind_legacy_oauth_insert_to_connection();

-- Catch rows inserted by an old server between the preceding migration and
-- trigger installation. Production had zero OAuth rows during design review;
-- this cutover still reconstructs parent chains and refuses ambiguous orphans.
DO $$
DECLARE
  v_code public.oauth_authorization_codes%ROWTYPE;
  v_token public.oauth_tokens%ROWTYPE;
  v_connection_id UUID;
  v_rows INTEGER;
BEGIN
  FOR v_code IN
    SELECT code.*
    FROM public.oauth_authorization_codes AS code
    WHERE code.connection_id IS NULL
    ORDER BY code.created_at, code.code_hash
  LOOP
    INSERT INTO public.oauth_connections (
      user_id, client_id, resource_uri, scopes, legacy_read_only
    ) VALUES (
      v_code.user_id, v_code.client_id, v_code.resource_uri, v_code.scopes, true
    )
    RETURNING id INTO v_connection_id;

    UPDATE public.oauth_authorization_codes
    SET connection_id = v_connection_id
    WHERE code_hash = v_code.code_hash
      AND connection_id IS NULL;
  END LOOP;

  -- First inherit bindings wherever a parent was already bound.
  LOOP
    UPDATE public.oauth_tokens AS child
    SET connection_id = parent.connection_id
    FROM public.oauth_tokens AS parent
    JOIN public.oauth_connections AS connection
      ON connection.id = parent.connection_id
    WHERE child.connection_id IS NULL
      AND child.parent_token_id = parent.id
      AND child.user_id = parent.user_id
      AND child.client_id = parent.client_id
      AND child.resource_uri = parent.resource_uri
      AND child.scopes <@ connection.scopes;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXIT WHEN v_rows = 0;
  END LOOP;

  -- Each unbound root refresh becomes its own legacy family. Descendants keep
  -- the same connection, preserving Settings revoke and reuse detection.
  FOR v_token IN
    SELECT token.*
    FROM public.oauth_tokens AS token
    WHERE token.connection_id IS NULL
      AND token.token_type = 'refresh'
      AND token.parent_token_id IS NULL
    ORDER BY token.created_at, token.id
  LOOP
    INSERT INTO public.oauth_connections (
      user_id, client_id, resource_uri, scopes, legacy_read_only
    ) VALUES (
      v_token.user_id,
      v_token.client_id,
      v_token.resource_uri,
      v_token.scopes,
      true
    )
    RETURNING id INTO v_connection_id;

    WITH RECURSIVE family(id) AS (
      SELECT v_token.id
      UNION
      SELECT child.id
      FROM public.oauth_tokens AS child
      JOIN family AS parent_family
        ON child.parent_token_id = parent_family.id
      WHERE child.connection_id IS NULL
        AND child.user_id = v_token.user_id
        AND child.client_id = v_token.client_id
        AND child.resource_uri = v_token.resource_uri
        AND child.scopes <@ v_token.scopes
    )
    UPDATE public.oauth_tokens AS family_token
    SET connection_id = v_connection_id
    FROM family
    WHERE family_token.id = family.id
      AND family_token.connection_id IS NULL;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.oauth_authorization_codes WHERE connection_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.oauth_tokens WHERE connection_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Unbound legacy OAuth rows require operator review'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- Keep connection_id nullable during the DB-first bridge. The legacy app omits
-- this generated Insert field and relies on the trigger above. The trigger and
-- connection-required CHECK bind every application insert; SET NOT NULL belongs
-- to the later contract migration after the old bundle is drained.

-- Recreate rotation with an explicit alias in the family-revocation branch.
-- Output column names are PL/pgSQL variables, so an unqualified connection_id
-- is ambiguous at runtime.
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
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_oauth_refresh_token_v2(
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;
