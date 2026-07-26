-- Expand the account-preserving purge boundary before switching application
-- callers. This migration does not revoke the v2 purge entrypoint or Calendar
-- direct DML yet; the contract migration follows only after generation-aware
-- application writers are deployed and old instances are drained.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. Account-preserving data generation
-- =============================================================================

CREATE TABLE private.user_data_controls (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  generation BIGINT NOT NULL DEFAULT 0 CHECK (generation >= 0),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

REVOKE ALL ON TABLE private.user_data_controls
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.user_data_controls (user_id, generation)
SELECT app_user.id, 0
FROM auth.users AS app_user
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE private.user_data_controls IS
  'Private account-preserving purge generation. External writers must bind and revalidate this value.';

CREATE FUNCTION private.get_user_data_generation_v1(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_generation BIGINT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required'
      USING ERRCODE = '22004';
  END IF;

  INSERT INTO private.user_data_controls (user_id, generation)
  SELECT app_user.id, 0
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  ON CONFLICT (user_id) DO NOTHING;

  SELECT control.generation
  INTO v_generation
  FROM private.user_data_controls AS control
  WHERE control.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User data generation is unavailable'
      USING ERRCODE = 'DG001';
  END IF;

  RETURN v_generation;
END;
$$;

REVOKE ALL ON FUNCTION private.get_user_data_generation_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_user_data_generation_v1(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN private.get_user_data_generation_v1(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_data_generation_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_data_generation_v1(UUID)
  TO service_role;

COMMENT ON FUNCTION public.get_user_data_generation_v1(UUID) IS
  'Returns the opaque account-preserving purge generation for one user; service role only.';

-- =============================================================================
-- 2. Calendar connection generation and callback save boundary
-- =============================================================================

ALTER TABLE public.calendar_connections
  ADD COLUMN data_generation BIGINT NOT NULL DEFAULT 0
    CHECK (data_generation >= 0);

COMMENT ON COLUMN public.calendar_connections.data_generation IS
  'User data generation in which this external Calendar authority was created.';

CREATE FUNCTION public.save_calendar_connection_command_v1(
  p_user_id UUID,
  p_expected_generation BIGINT,
  p_provider TEXT,
  p_provider_account_id TEXT,
  p_provider_account_email TEXT,
  p_granted_scopes TEXT[],
  p_refresh_token_enc TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_generation BIGINT;
  v_connection_id UUID;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL
    OR p_expected_generation IS NULL
    OR p_expected_generation < 0
    OR p_provider IS DISTINCT FROM 'google'
    OR NULLIF(pg_catalog.btrim(p_provider_account_id), '') IS NULL
    OR NULLIF(pg_catalog.btrim(p_refresh_token_enc), '') IS NULL
    OR COALESCE(pg_catalog.cardinality(p_granted_scopes), 0) = 0
    OR pg_catalog.array_position(p_granted_scopes, NULL::TEXT) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid Calendar connection input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  v_generation := private.get_user_data_generation_v1(p_user_id);

  IF v_generation IS DISTINCT FROM p_expected_generation THEN
    RAISE EXCEPTION 'User data generation is stale'
      USING ERRCODE = 'DG002';
  END IF;

  INSERT INTO public.calendar_connections (
    user_id,
    provider,
    provider_account_id,
    provider_account_email,
    granted_scopes,
    refresh_token_enc,
    status,
    last_sync_error,
    data_generation
  ) VALUES (
    p_user_id,
    p_provider,
    p_provider_account_id,
    p_provider_account_email,
    p_granted_scopes,
    p_refresh_token_enc,
    'active',
    NULL,
    v_generation
  )
  ON CONFLICT (user_id, provider, provider_account_id) DO UPDATE
  SET provider_account_email = EXCLUDED.provider_account_email,
      granted_scopes = EXCLUDED.granted_scopes,
      refresh_token_enc = EXCLUDED.refresh_token_enc,
      status = 'active',
      last_sync_error = NULL,
      data_generation = EXCLUDED.data_generation
  RETURNING calendar_connections.id INTO v_connection_id;

  RETURN v_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_calendar_connection_command_v1(
  UUID, BIGINT, TEXT, TEXT, TEXT, TEXT[], TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_calendar_connection_command_v1(
  UUID, BIGINT, TEXT, TEXT, TEXT, TEXT[], TEXT
) TO service_role;

COMMENT ON FUNCTION public.save_calendar_connection_command_v1(
  UUID, BIGINT, TEXT, TEXT, TEXT, TEXT[], TEXT
) IS
  'Atomically revalidates user data generation and saves one Calendar connection; service role only.';

-- =============================================================================
-- 3. Revoke-only Calendar outbox and payload-free security events
-- =============================================================================

CREATE TABLE private.calendar_revoke_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_connection_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'google'),
  refresh_token_enc TEXT NOT NULL CHECK (length(btrim(refresh_token_enc)) > 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL
    DEFAULT (pg_catalog.clock_timestamp() + INTERVAL '24 hours'),
  CONSTRAINT calendar_revoke_outbox_source_unique
    UNIQUE (user_id, source_connection_id),
  CONSTRAINT calendar_revoke_outbox_lease_shape CHECK (
    (lease_id IS NULL AND lease_expires_at IS NULL)
    OR (lease_id IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT calendar_revoke_outbox_expiry_order CHECK (expires_at > created_at)
);

CREATE INDEX calendar_revoke_outbox_due_idx
  ON private.calendar_revoke_outbox (available_at, created_at);
CREATE INDEX calendar_revoke_outbox_expiry_idx
  ON private.calendar_revoke_outbox (expires_at);

REVOKE ALL ON TABLE private.calendar_revoke_outbox
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.calendar_revoke_outbox IS
  'Revoke-only encrypted Calendar refresh tokens. Ciphertext is removed on success or within 24 hours.';

CREATE TABLE private.integration_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL CHECK (
    event_kind IN ('user_data_purged', 'calendar_revoke_expired')
  ),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX integration_security_events_retention_idx
  ON private.integration_security_events (occurred_at);

REVOKE ALL ON TABLE private.integration_security_events
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.integration_security_events IS
  'Payload-free integration security events retained for at most 90 days.';

-- =============================================================================
-- 4. Mutation receipts become generation-bound purge tombstones
-- =============================================================================

ALTER TABLE public.mcp_mutation_receipts
  ADD COLUMN data_generation BIGINT NOT NULL DEFAULT 0
    CHECK (data_generation >= 0),
  ADD COLUMN purged_generation BIGINT,
  ADD COLUMN purged_at TIMESTAMPTZ,
  ADD CONSTRAINT mcp_mutation_receipts_purge_shape CHECK (
    (purged_generation IS NULL AND purged_at IS NULL)
    OR (
      purged_generation IS NOT NULL
      AND purged_at IS NOT NULL
      AND purged_generation > data_generation
      AND resource_deleted_at IS NOT NULL
    )
  );

COMMENT ON COLUMN public.mcp_mutation_receipts.data_generation IS
  'DB-authored user data generation in which the mutation completed.';
COMMENT ON COLUMN public.mcp_mutation_receipts.purged_generation IS
  'First account-preserving purge generation that invalidated this successful receipt.';

CREATE OR REPLACE FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_generation BIGINT;
  v_origin_detach_allowed BOOLEAN;
  v_purge_mark_allowed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_generation := private.get_user_data_generation_v1(NEW.user_id);
    NEW.data_generation := v_generation;
    NEW.purged_generation := NULL;
    NEW.purged_at := NULL;
    NEW.applied_at := pg_catalog.clock_timestamp();
    RETURN NEW;
  END IF;

  v_origin_detach_allowed := (
    NEW.origin_connection_id IS NOT DISTINCT FROM OLD.origin_connection_id
    OR (
      OLD.origin_connection_id IS NOT NULL
      AND NEW.origin_connection_id IS NULL
    )
  );

  v_purge_mark_allowed := (
    (
      NEW.purged_generation IS NOT DISTINCT FROM OLD.purged_generation
      AND NEW.purged_at IS NOT DISTINCT FROM OLD.purged_at
      AND NEW.resource_deleted_at IS NOT DISTINCT FROM OLD.resource_deleted_at
    )
    OR (
      OLD.purged_generation IS NULL
      AND OLD.purged_at IS NULL
      AND NEW.purged_generation IS NOT NULL
      AND NEW.purged_at IS NOT NULL
      AND NEW.purged_generation > OLD.data_generation
      AND NEW.resource_deleted_at IS NOT NULL
      AND (
        OLD.resource_deleted_at IS NULL
        OR NEW.resource_deleted_at IS NOT DISTINCT FROM OLD.resource_deleted_at
      )
    )
  );

  IF v_origin_detach_allowed
    AND v_purge_mark_allowed
    AND ROW(
      NEW.user_id,
      NEW.client_id,
      NEW.operation_id,
      NEW.envelope_version,
      NEW.tool_name,
      NEW.request_digest,
      NEW.resource_type,
      NEW.resource_id,
      NEW.resource_version,
      NEW.applied_at,
      NEW.data_generation
    ) IS NOT DISTINCT FROM ROW(
      OLD.user_id,
      OLD.client_id,
      OLD.operation_id,
      OLD.envelope_version,
      OLD.tool_name,
      OLD.request_digest,
      OLD.resource_type,
      OLD.resource_id,
      OLD.resource_version,
      OLD.applied_at,
      OLD.data_generation
    ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'MCP mutation receipts are immutable'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.resolve_mcp_mutation_replay_v1(
  p_user_id UUID,
  p_client_id TEXT,
  p_operation_id UUID,
  p_tool_name TEXT,
  p_request_digest BYTEA,
  p_envelope_version SMALLINT,
  p_resource_type TEXT
)
RETURNS SETOF public.mcp_mutation_receipts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cutoff CONSTANT TIMESTAMPTZ :=
    pg_catalog.clock_timestamp() - INTERVAL '90 days';
  v_generation BIGINT;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
BEGIN
  SELECT receipt.*
  INTO v_receipt
  FROM public.mcp_mutation_receipts AS receipt
  WHERE receipt.user_id = p_user_id
    AND receipt.client_id = p_client_id
    AND receipt.operation_id = p_operation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_receipt.applied_at < v_cutoff THEN
    DELETE FROM public.mcp_mutation_receipts AS receipt
    WHERE receipt.user_id = p_user_id
      AND receipt.client_id = p_client_id
      AND receipt.operation_id = p_operation_id;
    RETURN;
  END IF;

  IF v_receipt.tool_name IS DISTINCT FROM p_tool_name
    OR v_receipt.request_digest IS DISTINCT FROM p_request_digest THEN
    RAISE EXCEPTION 'MCP operation ID was reused for a different request'
      USING ERRCODE = 'DM006';
  END IF;

  IF v_receipt.envelope_version IS DISTINCT FROM p_envelope_version
    OR v_receipt.resource_type IS DISTINCT FROM p_resource_type THEN
    RAISE EXCEPTION 'MCP mutation receipt invariant failed'
      USING ERRCODE = 'DM007';
  END IF;

  v_generation := private.get_user_data_generation_v1(p_user_id);

  IF v_receipt.purged_generation IS NOT NULL
    OR v_receipt.data_generation < v_generation THEN
    RAISE EXCEPTION 'MCP mutation result was removed by user data deletion'
      USING ERRCODE = 'DM008';
  END IF;

  RETURN NEXT v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_mcp_mutation_replay_v1(
  UUID, TEXT, UUID, TEXT, BYTEA, SMALLINT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

-- =============================================================================
-- 5. Serialize new MCP grants with account-preserving purge
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
SET lock_timeout = '5s'
AS $$
DECLARE
  v_connection_id UUID;
  v_has_write_scope BOOLEAN;
  v_enabled_client_ids TEXT[];
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_mcp_environment_resource_v1(p_resource_uri);
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

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

  IF v_has_write_scope AND p_write_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OAuth write scope is not enabled for this connection'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_has_write_scope AND p_write_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'OAuth read-only scope cannot enable writes'
      USING ERRCODE = '22023';
  END IF;

  IF v_has_write_scope THEN
    SELECT control.enabled_client_ids
    INTO v_enabled_client_ids
    FROM public.mcp_mutation_control AS control
    WHERE control.singleton_key = true
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MCP mutation control is missing'
        USING ERRCODE = 'DM002';
    END IF;

    IF NOT (p_client_id = ANY (v_enabled_client_ids)) THEN
      RAISE EXCEPTION 'MCP writes are disabled for this client'
        USING ERRCODE = 'DM003';
    END IF;
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
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_oauth_authorization_grant_v2(
  UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, BOOLEAN
) TO service_role;

-- =============================================================================
-- 6. Expanded account-preserving purge, not yet the app default
-- =============================================================================

CREATE FUNCTION public.delete_all_user_data_command_v3(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
DECLARE
  v_generation BIGINT;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  INSERT INTO private.user_data_controls (
    user_id,
    generation,
    changed_at
  ) VALUES (
    p_user_id,
    1,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
  SET generation = private.user_data_controls.generation + 1,
      changed_at = v_now
  RETURNING generation INTO v_generation;

  -- Keep only encrypted refresh tokens and only until provider revoke succeeds
  -- or the 24-hour hard expiry is reached.
  INSERT INTO private.calendar_revoke_outbox (
    user_id,
    source_connection_id,
    provider,
    refresh_token_enc,
    created_at,
    expires_at
  )
  SELECT
    connection.user_id,
    connection.id,
    connection.provider,
    connection.refresh_token_enc,
    v_now,
    v_now + INTERVAL '24 hours'
  FROM public.calendar_connections AS connection
  WHERE connection.user_id = p_user_id
  ON CONFLICT (user_id, source_connection_id) DO NOTHING;

  -- Revoke MCP authority without deleting the 90-day security tombstones.
  UPDATE public.oauth_connections AS connection
  SET revoked_at = COALESCE(connection.revoked_at, v_now),
      revoked_reason = COALESCE(connection.revoked_reason, 'user_data_purge')
  WHERE connection.user_id = p_user_id;

  UPDATE public.oauth_authorization_codes AS code
  SET consumed_at = COALESCE(code.consumed_at, v_now)
  WHERE code.user_id = p_user_id;

  UPDATE public.oauth_tokens AS token
  SET revoked_at = COALESCE(token.revoked_at, v_now)
  WHERE token.user_id = p_user_id;

  UPDATE public.mcp_mutation_receipts AS receipt
  SET resource_deleted_at = COALESCE(receipt.resource_deleted_at, v_now),
      purged_generation = v_generation,
      purged_at = v_now
  WHERE receipt.user_id = p_user_id
    AND receipt.purged_generation IS NULL;

  DELETE FROM public.records
  WHERE user_id = p_user_id;

  DELETE FROM public.plans
  WHERE user_id = p_user_id;

  DELETE FROM public.reports
  WHERE user_id = p_user_id;

  DELETE FROM public.tags
  WHERE user_id = p_user_id;

  DELETE FROM public.user_settings
  WHERE user_id = p_user_id;

  -- Delete the FK parent before the mirror sweep. A stale sync transaction
  -- either commits first and is swept below, or loses the FK race and cannot
  -- recreate a mirror after this transaction commits.
  DELETE FROM public.calendar_connections
  WHERE user_id = p_user_id;

  DELETE FROM public.external_calendar_events
  WHERE user_id = p_user_id;

  INSERT INTO private.integration_security_events (
    user_id,
    event_kind,
    occurred_at
  ) VALUES (
    p_user_id,
    'user_data_purged',
    v_now
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_all_user_data_command_v3(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_user_data_command_v3(UUID)
  TO service_role;

COMMENT ON FUNCTION public.delete_all_user_data_command_v3(UUID) IS
  'Expanded atomic account-preserving purge with generation advance, MCP revocation, Calendar revoke outbox, reports, and mirrors; service role only.';

COMMIT;
