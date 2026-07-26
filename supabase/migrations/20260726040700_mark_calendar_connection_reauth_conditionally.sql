-- Mark a Calendar connection for reauthorization only while it still owns the
-- refresh-token authority observed by the caller. A delayed fallback must not
-- overwrite a reconnect or a different token rotation that committed first.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.mark_calendar_connection_reauth_command_v1(
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_refresh_token_enc TEXT,
  p_last_synced_at TIMESTAMPTZ
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
  v_current_refresh_token_enc TEXT;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL
    OR p_connection_id IS NULL
    OR p_expected_generation IS NULL
    OR p_expected_generation < 0
    OR NULLIF(pg_catalog.btrim(p_expected_refresh_token_enc), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar reauthorization input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  v_current_generation := private.get_user_data_generation_v1(p_user_id);

  IF v_current_generation > p_expected_generation THEN
    RETURN 'missing';
  END IF;

  IF v_current_generation < p_expected_generation THEN
    RAISE EXCEPTION 'Calendar token generation is invalid'
      USING ERRCODE = 'DG003';
  END IF;

  SELECT
    connection.data_generation,
    connection.provider,
    connection.refresh_token_enc
  INTO
    v_connection_generation,
    v_connection_provider,
    v_current_refresh_token_enc
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

  IF v_current_refresh_token_enc IS DISTINCT FROM p_expected_refresh_token_enc THEN
    RETURN 'superseded';
  END IF;

  UPDATE public.calendar_connections AS connection
  SET status = 'reauth_required',
      last_sync_error = 'reauth_required',
      last_synced_at = pg_catalog.coalesce(
        p_last_synced_at,
        connection.last_synced_at
      )
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  RETURN 'marked';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_calendar_connection_reauth_command_v1(
  UUID, UUID, BIGINT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_calendar_connection_reauth_command_v1(
  UUID, UUID, BIGINT, TEXT, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.mark_calendar_connection_reauth_command_v1(
  UUID, UUID, BIGINT, TEXT, TIMESTAMPTZ
) IS
  'Conditionally marks the observed Calendar token authority reauth_required and reports marked, missing, or superseded; service role only.';

COMMIT;
