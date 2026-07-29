#!/usr/bin/env bash
set -euo pipefail

if [[ "${USE_LOCAL_DB:-}" != "true" ]]; then
  echo "Refusing to reset a database unless USE_LOCAL_DB=true." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

restore_required=false
restore_started=false
local_database_url='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
local_api_url='http://127.0.0.1:54321'
latest_migration_path="$(
  find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print \
    | LC_ALL=C sort \
    | tail -n 1
)"
latest_migration_version="$(basename "$latest_migration_path" | cut -d_ -f1)"

if [[ ! "$latest_migration_version" =~ ^[0-9]{14}$ ]]; then
  echo "Unable to determine the latest local migration version." >&2
  exit 1
fi

database_matches_reset_kind() {
  local reset_kind="$1"
  local state_matches

  case "$reset_kind" in
    "seedless reset")
      state_matches="$(
        psql "$local_database_url" \
          -X \
          -A \
          -t \
          -q \
          -v ON_ERROR_STOP=1 \
          <<SQL
-- MCP_RESET_STATE_SEEDLESS
SELECT
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '$latest_migration_version'
  )
  AND NOT EXISTS (SELECT 1 FROM public.mcp_environment_identity)
  AND NOT EXISTS (SELECT 1 FROM auth.users);
SQL
      )" || return 1
      ;;
    "seed restore")
      state_matches="$(
        psql "$local_database_url" \
          -X \
          -A \
          -t \
          -q \
          -v ON_ERROR_STOP=1 \
          <<SQL
-- MCP_RESET_STATE_SEEDED
SELECT
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '$latest_migration_version'
  )
  AND EXISTS (
    SELECT 1
    FROM public.mcp_environment_identity AS identity
    WHERE identity.singleton_key = true
      AND identity.environment = 'production'
      AND identity.authorization_server_uri = 'https://app.dayopt.app'
      AND identity.resource_uri = 'https://mcp.dayopt.app'
  )
  AND EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = '00000000-0000-0000-0000-000000000001'
  )
  AND (
    SELECT pg_catalog.count(*)
    FROM public.tags
    WHERE user_id = '00000000-0000-0000-0000-000000000001'
  ) = 5
  AND EXISTS (
    SELECT 1
    FROM public.plans
    WHERE user_id = '00000000-0000-0000-0000-000000000001'
  );
SQL
      )" || return 1
      ;;
    *)
      echo "Unknown Supabase local reset kind: ${reset_kind}" >&2
      return 1
      ;;
  esac

  [[ "$state_matches" == "t" ]]
}

storage_bucket_matches_default_seed() {
  local state_matches

  state_matches="$(
    psql "$local_database_url" \
      -X \
      -A \
      -t \
      -q \
      -v ON_ERROR_STOP=1 \
      <<'SQL'
-- MCP_RESET_STORAGE_SEEDED
SELECT EXISTS (
  SELECT 1
  FROM storage.buckets AS bucket
  WHERE bucket.id = 'avatars'
    AND bucket.public
    AND bucket.file_size_limit = 5242880
    AND bucket.allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ]::TEXT[]
);
SQL
  )" || return 1

  [[ "$state_matches" == "t" ]]
}

local_api_services_ready() {
  local path

  for path in '/auth/v1/health' '/rest/v1/' '/storage/v1/status'; do
    if ! curl \
      --fail \
      --max-time 2 \
      --silent \
      --show-error \
      "${local_api_url}${path}" \
      >/dev/null 2>&1; then
      return 1
    fi
  done
}

wait_for_local_api_services() {
  local max_attempts=15
  local attempt

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if local_api_services_ready; then
      return 0
    fi

    if ((attempt < max_attempts)); then
      sleep 2
    fi
  done

  return 1
}

recover_local_api_services() {
  local reset_kind="$1"
  local cli_succeeded=true

  echo "Restarting the local Supabase stack while preserving its data..." >&2

  if ! supabase stop --yes >/dev/null; then
    cli_succeeded=false
  fi

  if ! supabase start --yes >/dev/null; then
    cli_succeeded=false
  fi

  if ! database_matches_reset_kind "$reset_kind"; then
    echo \
      "Supabase local stack restart did not preserve the verified database state." \
      >&2
    return 1
  fi

  if ! wait_for_local_api_services; then
    echo \
      "Supabase local stack restart did not restore the required API services." \
      >&2
    return 1
  fi

  if [[ "$cli_succeeded" != "true" ]]; then
    echo \
      "Supabase local stack restart returned an error after reaching the verified target state; continuing." \
      >&2
  fi
}

restore_default_storage_bucket() {
  local max_attempts=2
  local attempt
  local cli_succeeded

  echo "Restoring the default local Storage bucket configuration..." >&2

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if supabase seed buckets --local --yes; then
      cli_succeeded=true
    else
      cli_succeeded=false
    fi

    if storage_bucket_matches_default_seed; then
      if [[ "$cli_succeeded" != "true" ]]; then
        echo \
          "Supabase local Storage bucket seed returned an error after reaching the verified target state; continuing." \
          >&2
      fi
      return 0
    fi

    if ((attempt == max_attempts)); then
      echo \
        "Supabase local Storage bucket seed did not reach its verified target state after ${max_attempts} attempts." \
        >&2
      return 1
    fi

    echo \
      "Supabase local Storage bucket seed did not reach its verified target state; retrying once..." \
      >&2
  done
}

reset_target_matches() {
  local reset_kind="$1"
  local reset_cli_succeeded="$2"

  if ! database_matches_reset_kind "$reset_kind"; then
    return 1
  fi

  if [[ "$reset_kind" != "seed restore" ]]; then
    return 0
  fi

  if ! local_api_services_ready; then
    if [[ "$reset_cli_succeeded" == "true" ]]; then
      if ! wait_for_local_api_services; then
        recover_local_api_services "$reset_kind" || return 1
      fi
    else
      recover_local_api_services "$reset_kind" || return 1
    fi
  fi

  if storage_bucket_matches_default_seed; then
    return 0
  fi

  if ! restore_default_storage_bucket; then
    return 1
  fi

  wait_for_local_api_services
}

reset_local_database() {
  local reset_kind="$1"
  shift

  local max_attempts=2
  local attempt
  local cli_succeeded

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if supabase db reset --local --yes "$@"; then
      cli_succeeded=true
    else
      cli_succeeded=false
    fi

    if reset_target_matches "$reset_kind" "$cli_succeeded"; then
      if [[ "$cli_succeeded" != "true" ]]; then
        echo \
          "Supabase local ${reset_kind} returned an error after reaching the verified target state; continuing." \
          >&2
      fi
      return 0
    fi

    if ((attempt == max_attempts)); then
      echo \
        "Supabase local ${reset_kind} did not reach its verified target state after ${max_attempts} attempts." \
        >&2
      return 1
    fi

    echo \
      "Supabase local ${reset_kind} did not reach its verified target state; retrying once..." \
      >&2
  done
}

restore_default_local_db() {
  if [[ "$restore_required" != "true" || "$restore_started" == "true" ]]; then
    return
  fi

  restore_started=true
  echo "Restoring the default local database seed..." >&2
  reset_local_database "seed restore"
}

trap restore_default_local_db EXIT

echo "Resetting the local database without seed data..."
restore_required=true
reset_local_database "seedless reset" --no-seed

psql "$local_database_url" \
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

restore_default_local_db
restore_required=false
trap - EXIT

echo "MCP environment identity rehearsal passed."
