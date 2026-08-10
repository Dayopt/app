-- OAuth retention: bounded cleanup RPCs for the 4 due flags that
-- get_external_authority_maintenance_status_v1() already reports but has no
-- corresponding cleanup function for (issue #1898). Each predicate below is
-- copied verbatim from that status function (20260730090005) so "due" and
-- "cleaned" never drift out of sync with each other.
--
-- Deletion order in the dispatcher is codes/access/refresh (24h/24h/30d) before
-- connections (90d): oauth_tokens and oauth_authorization_codes hold a composite
-- FK to oauth_connections(id, user_id, client_id, resource_uri) ON DELETE CASCADE
-- (supabase/schemas/017_tables_oauth.sql), so by the time a connection is due its
-- own bound tokens/codes have almost always already expired on their own shorter
-- clocks. The composite FK makes either call order safe either way (CASCADE / a
-- prior explicit delete both leave no orphaned rows) — this is a documentation
-- choice, not a correctness requirement.
--
-- cleanup_oauth_connections_v1 also cascades to mcp_mutation_receipts via
-- ON DELETE SET NULL on origin_connection_id. That UPDATE is explicitly allowed
-- by private.enforce_mcp_mutation_receipt_lifecycle_v1() (see
-- 20260729062447_allow_mcp_receipt_connection_detach.sql and the generation/purge
-- rewrite in 20260729073126_mcp_stage1_receipt_generation_lifecycle.sql) even
-- though receipts are otherwise immutable.
--
-- RPC names match apps/product/src/app/api/cron/external-connection-maintenance/
-- __tests__/maintenance-dispatcher.test.ts CLEANUP_COUNTS, which already
-- anticipated them ahead of this migration.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. authorization_codes_due cleanup (24 hours past consumed_at/expires_at)
-- =============================================================================

CREATE FUNCTION public.cleanup_oauth_authorization_codes_v1(
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff CONSTANT TIMESTAMPTZ :=
    pg_catalog.clock_timestamp() - INTERVAL '24 hours';
  v_deleted INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'OAuth authorization code cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT code.code_hash
    FROM public.oauth_authorization_codes AS code
    WHERE COALESCE(code.consumed_at, code.expires_at) <= v_cutoff
    ORDER BY COALESCE(code.consumed_at, code.expires_at), code.code_hash
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.oauth_authorization_codes AS code
  USING candidates
  WHERE code.code_hash = candidates.code_hash
    AND COALESCE(code.consumed_at, code.expires_at) <= v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_oauth_authorization_codes_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_oauth_authorization_codes_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.cleanup_oauth_authorization_codes_v1(INTEGER) IS
  'Deletes authorization codes consumed or expired at least 24 hours ago in a bounded batch; service role only.';

-- =============================================================================
-- 2. access_tokens_due cleanup (24 hours past effective expiry)
-- =============================================================================

CREATE FUNCTION public.cleanup_oauth_access_tokens_v1(
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff CONSTANT TIMESTAMPTZ :=
    pg_catalog.clock_timestamp() - INTERVAL '24 hours';
  v_deleted INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'OAuth access token cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT token.id
    FROM public.oauth_tokens AS token
    WHERE token.token_type = 'access'
      AND (
        CASE
          WHEN token.revoked_at IS NULL THEN token.expires_at
          WHEN token.revoked_at < token.expires_at THEN token.revoked_at
          ELSE token.expires_at
        END
      ) <= v_cutoff
    ORDER BY (
      CASE
        WHEN token.revoked_at IS NULL THEN token.expires_at
        WHEN token.revoked_at < token.expires_at THEN token.revoked_at
        ELSE token.expires_at
      END
    ), token.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.oauth_tokens AS token
  USING candidates
  WHERE token.id = candidates.id
    AND token.token_type = 'access'
    AND (
      CASE
        WHEN token.revoked_at IS NULL THEN token.expires_at
        WHEN token.revoked_at < token.expires_at THEN token.revoked_at
        ELSE token.expires_at
      END
    ) <= v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_oauth_access_tokens_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_oauth_access_tokens_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.cleanup_oauth_access_tokens_v1(INTEGER) IS
  'Deletes access tokens revoked or expired at least 24 hours ago in a bounded batch; service role only.';

-- =============================================================================
-- 3. refresh_tokens_due cleanup (30 days past effective end-of-life)
-- =============================================================================

CREATE FUNCTION public.cleanup_oauth_refresh_tokens_v1(
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff CONSTANT TIMESTAMPTZ :=
    pg_catalog.clock_timestamp() - INTERVAL '30 days';
  v_deleted INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'OAuth refresh token cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT token.id
    FROM public.oauth_tokens AS token
    WHERE token.token_type = 'refresh'
      AND LEAST(
        token.expires_at,
        COALESCE(token.rotated_at, 'infinity'::TIMESTAMPTZ),
        COALESCE(token.revoked_at, 'infinity'::TIMESTAMPTZ)
      ) <= v_cutoff
    ORDER BY LEAST(
      token.expires_at,
      COALESCE(token.rotated_at, 'infinity'::TIMESTAMPTZ),
      COALESCE(token.revoked_at, 'infinity'::TIMESTAMPTZ)
    ), token.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.oauth_tokens AS token
  USING candidates
  WHERE token.id = candidates.id
    AND token.token_type = 'refresh'
    AND LEAST(
      token.expires_at,
      COALESCE(token.rotated_at, 'infinity'::TIMESTAMPTZ),
      COALESCE(token.revoked_at, 'infinity'::TIMESTAMPTZ)
    ) <= v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_oauth_refresh_tokens_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_oauth_refresh_tokens_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.cleanup_oauth_refresh_tokens_v1(INTEGER) IS
  'Deletes refresh tokens expired, rotated, or revoked at least 30 days ago in a bounded batch; service role only.';

-- =============================================================================
-- 4. connections_due cleanup (90 days past effective revoke/reauth deadline)
-- =============================================================================

CREATE FUNCTION public.cleanup_oauth_connections_v1(
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff CONSTANT TIMESTAMPTZ :=
    pg_catalog.clock_timestamp() - INTERVAL '90 days';
  v_deleted INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'OAuth connection cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  -- NOTE (customer-visible): this predicate matches connections_due in
  -- get_external_authority_maintenance_status_v1() verbatim, which includes
  -- connections that were never revoked but whose reauth_required_at deadline
  -- passed 90+ days ago. Those rows can still be visible in Settings
  -- (revoked_at IS NULL). This is the intended retention contract, not a bug —
  -- changing which connections are due is a separate decision from this cleanup
  -- RPC's job of deleting whatever the status RPC already reports as due.
  --
  -- Deleting a connection cascades to any remaining public.oauth_tokens /
  -- public.oauth_authorization_codes rows still bound to it (composite FK
  -- ON DELETE CASCADE, supabase/schemas/017_tables_oauth.sql:100-102 / 133-135)
  -- and detaches public.mcp_mutation_receipts.origin_connection_id
  -- (ON DELETE SET NULL) — a transition private.enforce_mcp_mutation_receipt_
  -- lifecycle_v1() explicitly allows despite receipts otherwise being immutable.
  WITH candidates AS MATERIALIZED (
    SELECT connection.id
    FROM public.oauth_connections AS connection
    WHERE (
      CASE
        WHEN connection.revoked_at IS NULL THEN connection.reauth_required_at
        WHEN connection.revoked_at < connection.reauth_required_at THEN connection.revoked_at
        ELSE connection.reauth_required_at
      END
    ) <= v_cutoff
    ORDER BY (
      CASE
        WHEN connection.revoked_at IS NULL THEN connection.reauth_required_at
        WHEN connection.revoked_at < connection.reauth_required_at THEN connection.revoked_at
        ELSE connection.reauth_required_at
      END
    ), connection.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.oauth_connections AS connection
  USING candidates
  WHERE connection.id = candidates.id
    AND (
      CASE
        WHEN connection.revoked_at IS NULL THEN connection.reauth_required_at
        WHEN connection.revoked_at < connection.reauth_required_at THEN connection.revoked_at
        ELSE connection.reauth_required_at
      END
    ) <= v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_oauth_connections_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_oauth_connections_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.cleanup_oauth_connections_v1(INTEGER) IS
  'Deletes connections whose effective revoke/reauth deadline passed at least 90 days ago in a bounded batch, cascading to any remaining bound tokens/codes and detaching mcp_mutation_receipts.origin_connection_id; service role only.';

COMMIT;
