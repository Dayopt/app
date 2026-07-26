-- Give each database one immutable OAuth/MCP identity.
--
-- Existing databases with users or MCP authority are backfilled as
-- Production. A genuinely empty database remains unprovisioned until the
-- service-role-only RPC inserts exactly one Production or Staging identity.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.mcp_environment_identity (
  singleton_key BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton_key),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging')),
  authorization_server_uri TEXT NOT NULL,
  resource_uri TEXT NOT NULL,
  provisioned_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT mcp_environment_identity_tuple_check CHECK (
    (
      environment = 'production'
      AND authorization_server_uri = 'https://app.dayopt.app'
      AND resource_uri = 'https://mcp.dayopt.app'
    )
    OR
    (
      environment = 'staging'
      AND authorization_server_uri = 'https://staging.dayopt.app'
      AND resource_uri = 'https://mcp.staging.dayopt.app'
    )
  ),
  CONSTRAINT mcp_environment_identity_resource_uri_key UNIQUE (resource_uri)
);

-- A database that already contains user or MCP authority is necessarily the
-- established Production database. Fresh local/Preview/Staging databases have
-- no rows during migrations and must be provisioned after the migration chain.
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
COMMENT ON COLUMN public.mcp_environment_identity.provisioned_at IS
  'Irreversible identity creation time. Deleting authority rows never permits reclassification.';

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
  BEFORE UPDATE OR DELETE
  ON public.mcp_environment_identity
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_mcp_environment_identity_change_v1();

CREATE FUNCTION private.get_mcp_environment_resource_uri_v1()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

COMMENT ON FUNCTION private.get_mcp_environment_resource_uri_v1() IS
  'Returns and transaction-locks the database-owned MCP resource for internal authority boundaries.';

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

COMMENT ON FUNCTION private.require_mcp_environment_resource_v1(TEXT) IS
  'Validates a resource against the immutable database identity before an OAuth/MCP authority mutation.';

CREATE FUNCTION public.get_mcp_environment_identity_v1()
RETURNS TABLE(
  environment TEXT,
  authorization_server_uri TEXT,
  resource_uri TEXT,
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

COMMENT ON FUNCTION public.get_mcp_environment_identity_v1() IS
  'Returns the database-owned OAuth/MCP identity to service-role readiness and token-verification callers.';

CREATE FUNCTION public.provision_mcp_environment_identity_v1(
  p_environment TEXT,
  p_authorization_server_uri TEXT,
  p_resource_uri TEXT
)
RETURNS TABLE(
  environment TEXT,
  authorization_server_uri TEXT,
  resource_uri TEXT,
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
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    (
      p_environment = 'production'
      AND p_authorization_server_uri = 'https://app.dayopt.app'
      AND p_resource_uri = 'https://mcp.dayopt.app'
    )
    OR
    (
      p_environment = 'staging'
      AND p_authorization_server_uri = 'https://staging.dayopt.app'
      AND p_resource_uri = 'https://mcp.staging.dayopt.app'
    )
  ) THEN
    RAISE EXCEPTION 'Invalid MCP environment identity'
      USING ERRCODE = '22023';
  END IF;

  -- The table lock serializes the empty-table case with grants and FK checks.
  LOCK TABLE public.mcp_environment_identity IN EXCLUSIVE MODE;

  SELECT identity.*
  INTO v_identity
  FROM public.mcp_environment_identity AS identity
  WHERE identity.singleton_key = true;

  IF FOUND THEN
    IF v_identity.environment = p_environment
      AND v_identity.authorization_server_uri = p_authorization_server_uri
      AND v_identity.resource_uri = p_resource_uri THEN
      RETURN QUERY SELECT
        v_identity.environment,
        v_identity.authorization_server_uri,
        v_identity.resource_uri,
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

  -- SHARE blocks concurrent inserts while the emptiness proof is evaluated.
  -- Production may already have users; Staging must be genuinely data-less.
  LOCK TABLE auth.users IN SHARE MODE;
  LOCK TABLE public.oauth_connections IN SHARE MODE;
  LOCK TABLE public.oauth_authorization_codes IN SHARE MODE;
  LOCK TABLE public.oauth_tokens IN SHARE MODE;
  LOCK TABLE public.oauth_audit_log IN SHARE MODE;
  LOCK TABLE public.mcp_mutation_receipts IN SHARE MODE;

  IF p_environment = 'staging' AND EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'Staging MCP identity requires a data-less database'
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
    resource_uri
  ) VALUES (
    true,
    p_environment,
    p_authorization_server_uri,
    p_resource_uri
  )
  RETURNING * INTO v_identity;

  RETURN QUERY SELECT
    v_identity.environment,
    v_identity.authorization_server_uri,
    v_identity.resource_uri,
    v_identity.provisioned_at;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_mcp_environment_identity_v1(
  TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provision_mcp_environment_identity_v1(
  TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.provision_mcp_environment_identity_v1(
  TEXT, TEXT, TEXT
) IS
  'Insert-once exact identity provisioning. Same-value retries are idempotent; reclassification is impossible.';

COMMIT;
