#!/usr/bin/env bash
set -euo pipefail

if [[ "${USE_LOCAL_DB:-}" != "true" ]]; then
  echo "Refusing to reset a database unless USE_LOCAL_DB=true." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

restore_required=false

restore_default_local_db() {
  if [[ "$restore_required" != "true" ]]; then
    return
  fi

  echo "Restoring the default local database seed..." >&2
  supabase db reset --local
}

trap restore_default_local_db EXIT

echo "Resetting the local database without seed data..."
supabase db reset --local --no-seed
restore_required=true

psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  -X \
  -q \
  -v ON_ERROR_STOP=1 \
  <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.mcp_environment_identity) THEN
    RAISE EXCEPTION 'Fresh data-less database must start unprovisioned';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'Fresh staging rehearsal must not contain users';
  END IF;
END;
$$;

DO $$
BEGIN
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    false
  );

  PERFORM public.provision_mcp_environment_identity_v1(
    'staging',
    'https://staging.dayopt.app',
    'https://mcp.staging.dayopt.app'
  );

  -- Same-value retry is the only permitted repeat.
  PERFORM public.provision_mcp_environment_identity_v1(
    'staging',
    'https://staging.dayopt.app',
    'https://mcp.staging.dayopt.app'
  );
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.provision_mcp_environment_identity_v1(
      'production',
      'https://app.dayopt.app',
      'https://mcp.dayopt.app'
    );
    RAISE EXCEPTION 'Expected identity reclassification rejection';
  EXCEPTION WHEN SQLSTATE 'DI002' THEN
    NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.mcp_environment_identity AS identity
    WHERE identity.singleton_key = true
      AND identity.environment = 'staging'
      AND identity.authorization_server_uri = 'https://staging.dayopt.app'
      AND identity.resource_uri = 'https://mcp.staging.dayopt.app'
  ) THEN
    RAISE EXCEPTION 'Staging identity does not match the exact tuple';
  END IF;

  IF pg_catalog.has_table_privilege(
    'service_role',
    'public.mcp_environment_identity',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) THEN
    RAISE EXCEPTION 'service_role must not receive direct identity table privileges';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.get_mcp_environment_identity_v1()',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.provision_mcp_environment_identity_v1(text,text,text)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'public.get_mcp_environment_identity_v1()',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.provision_mcp_environment_identity_v1(text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MCP identity RPC privileges are not service-role-only';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conname = ANY (ARRAY[
      'oauth_connections_environment_resource_fkey',
      'oauth_authorization_codes_environment_resource_fkey',
      'oauth_tokens_environment_resource_fkey'
    ]::TEXT[])
      AND NOT constraint_row.convalidated
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conname = ANY (ARRAY[
      'oauth_connections_environment_resource_fkey',
      'oauth_authorization_codes_environment_resource_fkey',
      'oauth_tokens_environment_resource_fkey'
    ]::TEXT[])
  ) <> 3 THEN
    RAISE EXCEPTION 'MCP environment resource constraints are incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.oid = procedure_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND procedure_row.proname = ANY (ARRAY[
        'get_mcp_environment_identity_v1',
        'provision_mcp_environment_identity_v1',
        'issue_oauth_token_pair',
        'bind_legacy_oauth_insert_to_connection'
      ]::TEXT[])
      AND (
        NOT procedure_row.prosecdef
        OR NOT (
          COALESCE(procedure_row.proconfig, ARRAY[]::TEXT[])
          @> ARRAY['search_path=""']::TEXT[]
        )
      )
  ) THEN
    RAISE EXCEPTION 'MCP identity functions require SECURITY DEFINER and empty search_path';
  END IF;
END;
$$;

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  aud,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  email_change_confirm_status
) VALUES (
  '00000000-0000-0000-0000-0000000000e6',
  '00000000-0000-0000-0000-000000000000',
  'mcp-staging-identity@dayopt.dev',
  crypt('local-test-only', gen_salt('bf')),
  pg_catalog.now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"MCP Staging Identity"}',
  pg_catalog.now(),
  pg_catalog.now(),
  'authenticated',
  'authenticated',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  0
);

DO $$
BEGIN
  PERFORM public.create_oauth_authorization_grant_v2(
    '00000000-0000-0000-0000-0000000000e6',
    'chatgpt',
    'https://mcp.staging.dayopt.app',
    ARRAY['read:entries']::TEXT[],
    encode(digest('staging-code', 'sha256'), 'hex'),
    'https://chatgpt.com/connector_platform_oauth_redirect',
    repeat('a', 43),
    false
  );
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.create_oauth_authorization_grant_v2(
      '00000000-0000-0000-0000-0000000000e6',
      'chatgpt',
      'https://mcp.dayopt.app',
      ARRAY['read:entries']::TEXT[],
      encode(digest('wrong-production-code', 'sha256'), 'hex'),
      'https://chatgpt.com/connector_platform_oauth_redirect',
      repeat('a', 43),
      false
    );
    RAISE EXCEPTION 'Expected Production resource rejection';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.oauth_connections (
      user_id,
      client_id,
      resource_uri,
      scopes
    ) VALUES (
      '00000000-0000-0000-0000-0000000000e6',
      'chatgpt',
      'https://mcp.dayopt.app',
      ARRAY['read:entries']::TEXT[]
    );
    RAISE EXCEPTION 'Expected singleton FK rejection';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  IF (SELECT count(*) FROM public.oauth_connections) <> 1
    OR (SELECT count(*) FROM public.oauth_authorization_codes) <> 1 THEN
    RAISE EXCEPTION 'Wrong-resource attempts changed OAuth authority';
  END IF;
END;
$$;
SQL

echo "Restoring the default local database seed..."
supabase db reset --local
restore_required=false
trap - EXIT

echo "MCP environment identity rehearsal passed."
