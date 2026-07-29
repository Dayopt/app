-- Expand the external lifecycle boundary on top of Candidate 1.
-- Candidate 1 already owns the user generation, MCP receipt lifecycle, and OAuth grant.
-- This migration adds Calendar compatibility storage and the account-preserving purge command.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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
