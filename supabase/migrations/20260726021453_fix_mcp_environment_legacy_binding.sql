-- PL/pgSQL resolves NEW fields against the trigger relation before evaluating
-- a combined boolean expression. Keep the oauth_tokens-only parent field in a
-- nested branch so authorization-code inserts remain compatible.

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

COMMIT;
