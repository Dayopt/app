-- Correct the expanded purge before it becomes an application entrypoint.
--
-- Calendar token capture must lock connection rows so a concurrent refresh
-- rotation cannot commit a newer ciphertext after the outbox copied an older
-- value. OAuth code exchange locks code -> connection; use the same order here
-- before the existing connection -> token family order.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.delete_all_user_data_command_v3(p_user_id UUID)
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

  WITH locked_calendar_connections AS (
    SELECT
      connection.user_id,
      connection.id,
      connection.provider,
      connection.refresh_token_enc
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
    FOR UPDATE
  )
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
  FROM locked_calendar_connections AS connection
  ON CONFLICT (user_id, source_connection_id) DO NOTHING;

  UPDATE public.oauth_authorization_codes AS code
  SET consumed_at = COALESCE(code.consumed_at, v_now)
  WHERE code.user_id = p_user_id;

  UPDATE public.oauth_connections AS connection
  SET revoked_at = COALESCE(connection.revoked_at, v_now),
      revoked_reason = COALESCE(connection.revoked_reason, 'user_data_purge')
  WHERE connection.user_id = p_user_id;

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
  'Expanded atomic account-preserving purge with generation advance, locked Calendar token capture, MCP revocation, reports, and mirrors; service role only.';

COMMIT;
