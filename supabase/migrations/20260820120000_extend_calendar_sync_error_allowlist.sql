-- #2078: sync-service.ts の SyncErrorCode は partial_timeout（#1965）を持つが、
-- finish_calendar_sync_run_v1 の p_last_sync_error allowlist にはまだ無い。#2050 の
-- fenced writer 移行が partial_timeout を書こうとすると 22023 で拒否されるため、その
-- 移行より先にここへ追加する。CAS ロジック本体（lock_calendar_sync_writer_v1 呼び出し以下）
-- は変更しない — bug-fix 相当の allowlist 追加のみ。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.finish_calendar_sync_run_v1(
  p_project_key TEXT,
  p_user_id UUID,
  p_connection_id UUID,
  p_expected_generation BIGINT,
  p_expected_authority_fence_id UUID,
  p_expected_authority_epoch BIGINT,
  p_expected_sync_sequence BIGINT,
  p_run_started_at TIMESTAMPTZ,
  p_last_sync_error TEXT,
  p_prune_window BOOLEAN,
  p_not_before TIMESTAMPTZ,
  p_not_after TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_writer_state TEXT;
  v_connection_last_synced_at TIMESTAMPTZ;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_run_started_at IS NULL
    OR p_run_started_at > v_now + INTERVAL '1 minute'
    OR p_last_sync_error NOT IN (
      'encryption_key_invalid',
      'partial_failure',
      'partial_timeout',
      'provider_unavailable',
      'rate_limited',
      'reauth_required'
    )
      AND p_last_sync_error IS NOT NULL
    OR p_prune_window IS NULL
    OR (
      p_prune_window
      AND (
        p_not_before IS NULL
        OR p_not_after IS NULL
        OR p_not_after <= p_not_before
      )
    )
    OR (
      NOT p_prune_window
      AND (p_not_before IS NOT NULL OR p_not_after IS NOT NULL)
    ) THEN
    RAISE EXCEPTION 'Invalid Calendar sync completion input'
      USING ERRCODE = '22023';
  END IF;

  v_writer_state := private.lock_calendar_sync_writer_v1(
    p_project_key,
    p_user_id,
    p_connection_id,
    p_expected_generation,
    p_expected_authority_fence_id,
    p_expected_authority_epoch,
    p_expected_sync_sequence
  );

  IF v_writer_state IS DISTINCT FROM 'current' THEN
    RETURN v_writer_state;
  END IF;

  SELECT connection.last_synced_at
  INTO v_connection_last_synced_at
  FROM public.calendar_connections AS connection
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  IF v_connection_last_synced_at > p_run_started_at THEN
    RETURN 'superseded';
  END IF;

  IF p_prune_window THEN
    DELETE FROM public.external_calendar_events AS event
    WHERE event.user_id = p_user_id
      AND event.connection_id = p_connection_id
      AND event.last_synced_at <= p_run_started_at
      AND (
        event.end_at < p_not_before
        OR event.start_at > p_not_after
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.plans AS plan
        WHERE plan.user_id = p_user_id
          AND plan.external_calendar_event_id = event.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.records AS record
        WHERE record.user_id = p_user_id
          AND record.external_calendar_event_id = event.id
      );
  END IF;

  UPDATE public.calendar_connections AS connection
  SET last_sync_error = p_last_sync_error,
      last_synced_at = p_run_started_at
  WHERE connection.id = p_connection_id
    AND connection.user_id = p_user_id;

  RETURN 'finished';
END;
$$;

REVOKE ALL ON FUNCTION public.finish_calendar_sync_run_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, TIMESTAMPTZ,
  TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_calendar_sync_run_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, TIMESTAMPTZ,
  TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.finish_calendar_sync_run_v1(
  TEXT, UUID, UUID, BIGINT, UUID, BIGINT, BIGINT, TIMESTAMPTZ,
  TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ
) IS
  'Publishes connection status and optional anti-join window pruning only if no newer DB-issued sync run, purge, reconnect, selection change, or revoke superseded it; service role only. p_last_sync_error allowlist includes partial_timeout (#2078).';

COMMIT;
