-- Supabase Auth stores third-party OAuth PKCE state without a user FK. Keep
-- that transient authority out of the atomic Preview identity insertion.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION private.reject_mcp_preview_oauth_client_state_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
BEGIN
  IF NEW.environment IS DISTINCT FROM 'preview' THEN
    RETURN NEW;
  END IF;

  LOCK TABLE auth.oauth_client_states IN SHARE MODE;

  IF EXISTS (SELECT 1 FROM auth.oauth_client_states) THEN
    RAISE EXCEPTION
      'Preview MCP identity requires unused Auth OAuth state'
      USING ERRCODE = 'DI005';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.reject_mcp_preview_oauth_client_state_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trigger_reject_mcp_preview_oauth_client_state
  BEFORE INSERT ON public.mcp_environment_identity
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_mcp_preview_oauth_client_state_v1();

COMMENT ON FUNCTION private.reject_mcp_preview_oauth_client_state_v1() IS
  'Rejects Preview environment identity insertion while Supabase Auth OAuth client state exists.';

COMMIT;
