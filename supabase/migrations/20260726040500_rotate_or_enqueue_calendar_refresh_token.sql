-- Persist a provider-rotated Calendar refresh token without allowing an
-- account-preserving purge to strand newly acquired external authority.
--
-- The caller supplies the generation and ciphertext it originally read. A
-- same-generation update is compare-and-swap; only a strictly newer DB
-- generation proves that purge already won and permits moving the new
-- ciphertext into the revoke-only outbox.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.rotate_or_enqueue_calendar_refresh_token_command_v1(
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_refresh_token_enc TEXT,
  p_new_refresh_token_enc TEXT
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
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL
    OR p_connection_id IS NULL
    OR p_expected_generation IS NULL
    OR p_expected_generation < 0
    OR NULLIF(pg_catalog.btrim(p_expected_refresh_token_enc), '') IS NULL
    OR NULLIF(pg_catalog.btrim(p_new_refresh_token_enc), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid Calendar token rotation input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  v_current_generation := private.get_user_data_generation_v1(p_user_id);

  IF v_current_generation > p_expected_generation THEN
    INSERT INTO private.calendar_revoke_outbox (
      user_id,
      source_connection_id,
      provider,
      refresh_token_enc,
      created_at,
      expires_at
    ) VALUES (
      p_user_id,
      p_connection_id,
      'google',
      p_new_refresh_token_enc,
      v_now,
      v_now + INTERVAL '24 hours'
    );

    RETURN 'enqueued';
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
    RAISE EXCEPTION 'Calendar connection is unavailable'
      USING ERRCODE = 'CA001';
  END IF;

  IF v_connection_generation IS DISTINCT FROM p_expected_generation
    OR v_connection_provider IS DISTINCT FROM 'google' THEN
    RAISE EXCEPTION 'Calendar connection generation invariant failed'
      USING ERRCODE = 'CA003';
  END IF;

  IF v_current_refresh_token_enc IS DISTINCT FROM p_expected_refresh_token_enc THEN
    RAISE EXCEPTION 'Calendar refresh token changed concurrently'
      USING ERRCODE = 'CA002';
  END IF;

  UPDATE public.calendar_connections AS connection
  SET refresh_token_enc = p_new_refresh_token_enc
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  RETURN 'updated';
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_or_enqueue_calendar_refresh_token_command_v1(
  UUID, UUID, BIGINT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_or_enqueue_calendar_refresh_token_command_v1(
  UUID, UUID, BIGINT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.rotate_or_enqueue_calendar_refresh_token_command_v1(
  UUID, UUID, BIGINT, TEXT, TEXT
) IS
  'CAS-updates a rotated Calendar refresh token or enqueues it when a newer purge generation already committed; service role only.';

COMMIT;
