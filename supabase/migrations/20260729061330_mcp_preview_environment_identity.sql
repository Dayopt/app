-- Add an immutable, insert-once OAuth identity for an explicitly bound,
-- data-less PR Preview. Existing Production/Staging identities are not
-- reclassified and keep a NULL Supabase project ref.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.mcp_environment_identity
  ADD COLUMN supabase_project_ref TEXT;

ALTER TABLE public.mcp_environment_identity
  DROP CONSTRAINT mcp_environment_identity_environment_check,
  DROP CONSTRAINT mcp_environment_identity_tuple_check,
  ADD CONSTRAINT mcp_environment_identity_environment_check CHECK (
    environment IN ('production', 'staging', 'preview')
  ),
  ADD CONSTRAINT mcp_environment_identity_tuple_check CHECK (
    (
      environment = 'production'
      AND authorization_server_uri = 'https://app.dayopt.app'
      AND resource_uri = 'https://mcp.dayopt.app'
      AND supabase_project_ref IS NULL
    )
    OR
    (
      environment = 'staging'
      AND authorization_server_uri = 'https://staging.dayopt.app'
      AND resource_uri = 'https://mcp.staging.dayopt.app'
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
  );

COMMENT ON COLUMN public.mcp_environment_identity.supabase_project_ref IS
  'Exact Supabase project ref bound to a Preview identity. NULL for established Production/Staging identities.';

CREATE FUNCTION public.get_mcp_environment_identity_v2()
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

REVOKE ALL ON FUNCTION public.get_mcp_environment_identity_v2()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mcp_environment_identity_v2()
  TO service_role;

COMMENT ON FUNCTION public.get_mcp_environment_identity_v2() IS
  'Returns the immutable OAuth/MCP identity and Preview Supabase project binding to service-role readiness callers.';

CREATE FUNCTION public.provision_mcp_preview_environment_identity_v2(
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

  -- Lock every authority surface before proving the Preview is data-less.
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

REVOKE ALL ON FUNCTION public.provision_mcp_preview_environment_identity_v2(
  TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provision_mcp_preview_environment_identity_v2(
  TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.provision_mcp_preview_environment_identity_v2(
  TEXT, TEXT, TEXT
) IS
  'Insert-once Preview identity provisioning. Requires an exact service-role JWT project ref, empty authority tables, and closed write gates.';

COMMIT;
