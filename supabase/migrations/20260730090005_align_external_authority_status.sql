-- Keep oldest-due age on the same population as the due counter. Work under an
-- active, non-expired lease is in progress and must not appear overdue.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_external_authority_maintenance_status_v1()
RETURNS TABLE (
  calendar_revoke_due BIGINT,
  calendar_revoke_total BIGINT,
  oldest_due_age_seconds BIGINT,
  authorization_codes_due BOOLEAN,
  access_tokens_due BOOLEAN,
  refresh_tokens_due BOOLEAN,
  connections_due BOOLEAN,
  receipts_due BOOLEAN,
  security_events_due BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT pg_catalog.count(*)
      FROM private.calendar_revoke_outbox AS queued
      WHERE queued.expires_at <= v_now
        OR (
          queued.available_at <= v_now
          AND (
            queued.lease_id IS NULL
            OR queued.lease_expires_at <= v_now
          )
        )
    ),
    (
      SELECT pg_catalog.count(*)
      FROM private.calendar_revoke_outbox
    ),
    COALESCE(
      (
        SELECT GREATEST(
          0,
          pg_catalog.floor(
            pg_catalog.date_part(
              'epoch',
              v_now - MIN(queued.available_at)
            )
          )::BIGINT
        )
        FROM private.calendar_revoke_outbox AS queued
        WHERE queued.expires_at <= v_now
          OR (
            queued.available_at <= v_now
            AND (
              queued.lease_id IS NULL
              OR queued.lease_expires_at <= v_now
            )
          )
      ),
      0
    ),
    EXISTS (
      SELECT 1
      FROM public.oauth_authorization_codes AS code
      WHERE COALESCE(code.consumed_at, code.expires_at)
        <= v_now - INTERVAL '24 hours'
    ),
    EXISTS (
      SELECT 1
      FROM public.oauth_tokens AS token
      WHERE token.token_type = 'access'
        AND (
          CASE
            WHEN token.revoked_at IS NULL THEN token.expires_at
            WHEN token.revoked_at < token.expires_at THEN token.revoked_at
            ELSE token.expires_at
          END
        ) <= v_now - INTERVAL '24 hours'
    ),
    EXISTS (
      SELECT 1
      FROM public.oauth_tokens AS token
      WHERE token.token_type = 'refresh'
        AND LEAST(
          token.expires_at,
          COALESCE(token.rotated_at, 'infinity'::TIMESTAMPTZ),
          COALESCE(token.revoked_at, 'infinity'::TIMESTAMPTZ)
        ) <= v_now - INTERVAL '30 days'
    ),
    EXISTS (
      SELECT 1
      FROM public.oauth_connections AS connection
      WHERE (
        CASE
          WHEN connection.revoked_at IS NULL THEN connection.reauth_required_at
          WHEN connection.revoked_at < connection.reauth_required_at THEN connection.revoked_at
          ELSE connection.reauth_required_at
        END
      ) <= v_now - INTERVAL '90 days'
    ),
    EXISTS (
      SELECT 1
      FROM public.mcp_mutation_receipts AS receipt
      WHERE receipt.applied_at < v_now - INTERVAL '90 days'
    ),
    EXISTS (
      SELECT 1
      FROM private.integration_security_events AS event
      WHERE event.occurred_at <= v_now - INTERVAL '90 days'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_external_authority_maintenance_status_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_external_authority_maintenance_status_v1()
  TO service_role;

COMMENT ON FUNCTION public.get_external_authority_maintenance_status_v1() IS
  'Returns aggregate-only unleased/expired revoke backlog and retention due flags without IDs or payloads; service role only.';

COMMIT;
