-- Prepare token-rotation recovery entirely in the database before any provider
-- revoke. The current connection is fail-closed and an encryptable rotated
-- token is durably placed in the revoke outbox in the same transaction.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.prepare_calendar_token_rotation_recovery_command_v1(
  p_operation_id UUID,
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_refresh_token_enc TEXT,
  p_new_refresh_token_enc TEXT DEFAULT NULL,
  p_last_synced_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_current_generation BIGINT;
  v_connection_generation BIGINT;
  v_connection_provider TEXT;
  v_queued_user_id UUID;
  v_queued_connection_id UUID;
  v_queued_provider TEXT;
  v_queued_refresh_token_enc TEXT;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_user_id IS NULL
    OR p_connection_id IS NULL
    OR p_expected_generation IS NULL
    OR p_expected_generation < 0
    OR NULLIF(pg_catalog.btrim(p_expected_refresh_token_enc), '') IS NULL
    OR (
      p_new_refresh_token_enc IS NOT NULL
      AND NULLIF(pg_catalog.btrim(p_new_refresh_token_enc), '') IS NULL
    ) THEN
    RAISE EXCEPTION 'Invalid Calendar token recovery input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  v_current_generation := private.get_user_data_generation_v1(p_user_id);

  IF v_current_generation < p_expected_generation THEN
    RAISE EXCEPTION 'Calendar token generation is invalid'
      USING ERRCODE = 'DG003';
  END IF;

  IF p_new_refresh_token_enc IS NOT NULL THEN
    SELECT
      queued.user_id,
      queued.source_connection_id,
      queued.provider,
      queued.refresh_token_enc
    INTO
      v_queued_user_id,
      v_queued_connection_id,
      v_queued_provider,
      v_queued_refresh_token_enc
    FROM private.calendar_revoke_outbox AS queued
    WHERE queued.id = p_operation_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_queued_user_id IS DISTINCT FROM p_user_id
        OR v_queued_connection_id IS DISTINCT FROM p_connection_id
        OR v_queued_provider IS DISTINCT FROM 'google'
        OR v_queued_refresh_token_enc IS DISTINCT FROM p_new_refresh_token_enc THEN
        RAISE EXCEPTION 'Calendar token recovery operation was reused'
          USING ERRCODE = 'CA004';
      END IF;
    ELSE
      INSERT INTO private.calendar_revoke_outbox (
        id,
        user_id,
        source_connection_id,
        provider,
        refresh_token_enc,
        created_at,
        expires_at
      ) VALUES (
        p_operation_id,
        p_user_id,
        p_connection_id,
        'google',
        p_new_refresh_token_enc,
        v_now,
        v_now + INTERVAL '24 hours'
      );
    END IF;
  END IF;

  IF v_current_generation > p_expected_generation THEN
    RETURN 'missing';
  END IF;

  SELECT
    connection.data_generation,
    connection.provider
  INTO
    v_connection_generation,
    v_connection_provider
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF v_connection_generation IS DISTINCT FROM p_expected_generation
    OR v_connection_provider IS DISTINCT FROM 'google' THEN
    RAISE EXCEPTION 'Calendar connection generation invariant failed'
      USING ERRCODE = 'CA003';
  END IF;

  -- A provider revoke can invalidate the whole Google grant, not only one
  -- ciphertext. Fail-close even when a reconnect or another rotation already
  -- superseded the authority observed by this caller.
  UPDATE public.calendar_connections AS connection
  SET status = 'reauth_required',
      last_sync_error = 'reauth_required',
      last_synced_at = COALESCE(
        p_last_synced_at,
        connection.last_synced_at
      )
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  RETURN 'marked';
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_calendar_token_rotation_recovery_command_v1(
  UUID, UUID, UUID, BIGINT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_calendar_token_rotation_recovery_command_v1(
  UUID, UUID, UUID, BIGINT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.prepare_calendar_token_rotation_recovery_command_v1(
  UUID, UUID, UUID, BIGINT, TEXT, TEXT, TIMESTAMPTZ
) IS
  'Atomically fail-closes the current Calendar authority and durably enqueues an encryptable rotated token before provider revocation; service role only.';

COMMIT;
