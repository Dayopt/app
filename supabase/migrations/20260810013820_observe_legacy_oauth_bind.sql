-- Stage 8-3 observation window (docs/projects/mcp-plan-track-learn/
-- step-6-candidate-8-cleanup.md §Stage 8-3, primary stop condition).
--
-- bind_legacy_oauth_insert_to_connection() is the compatibility BEFORE INSERT
-- trigger function that absorbs connection_id IS NULL inserts on
-- oauth_authorization_codes / oauth_tokens. Every legacy writer insert is
-- defined as connection_id IS NULL, so it always passes through this
-- function, and the trigger WHEN clause (WHEN (NEW.connection_id IS NULL))
-- already restricts execution to that population. Recording every time the
-- function actually completes a connection_id backfill measures use of the
-- DROP target itself instead of a downstream proxy (row joins, flags,
-- retention survival), which the earlier stop-condition drafts could not
-- close (see the doc's §Stage 8-3 rationale for the three proxy blind spots
-- this replaces).
--
-- Expand-only migration: the trigger's decision logic (parent-token
-- inheritance, refresh-token ambiguity check, resource/scope validation, new
-- legacy_read_only connection creation) is copied verbatim from the latest
-- definition (20260729073125_mcp_environment_identity_client_fence.sql). The
-- only functional additions are (a) one local variable that records whether
-- the parent-token branch fired and (b) one append-only observation INSERT
-- placed immediately before the function assigns the resolved connection_id
-- to NEW and returns — i.e. only on the branch where a backfill actually
-- happened. No other behavior changes: no new exception path, no changed
-- exception code, no changed return value.
--
-- private.legacy_oauth_bind_observations is redacted by design: no user_id,
-- token id, client_id, or other identifier, only which table fired, whether
-- the oauth_tokens parent-inheritance branch was used, and when. It is
-- append-only (no UPDATE/DELETE grant to any role) and excluded from the
-- Stage 8-2 / 8-3 cleanup scope, so it carries no retention conflict with the
-- receipt/connection rows the observation window is watching.
--
-- Rollback (forward restoration, matches the doc's stop-condition framing):
-- CREATE OR REPLACE the function back to the 20260729073125 body (drop the
-- observation INSERT and v_had_parent) and DROP TABLE
-- private.legacy_oauth_bind_observations. Both steps are additive-only in
-- reverse and carry no data-loss risk beyond the observation counts
-- themselves.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE private.legacy_oauth_bind_observations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table TEXT NOT NULL
    CHECK (source_table IN ('oauth_authorization_codes', 'oauth_tokens')),
  had_parent BOOLEAN NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

COMMENT ON TABLE private.legacy_oauth_bind_observations IS
  'Append-only counter: one row per bind_legacy_oauth_insert_to_connection() '
  'backfill. No user/token/client identifiers by design. Stage 8-3 primary '
  'stop-condition evidence (docs/projects/mcp-plan-track-learn/'
  'step-6-candidate-8-cleanup.md).';

-- Deny by default, matching every other private table in this schema. Access
-- is through the table grant below only; there is no SECURITY DEFINER reader
-- because the count itself, not a filtered view, is what the stop condition
-- needs.
REVOKE ALL ON TABLE private.legacy_oauth_bind_observations
  FROM PUBLIC, anon, authenticated, service_role;

-- The `private` schema's USAGE grant to service_role was revoked wholesale in
-- 20260729062445_mcp_mutation_envelope_foundation.sql. Re-grant USAGE (schema
-- entry only, not blanket table access — every other private table keeps its
-- own REVOKE ALL FROM service_role above) so the read-only preflight this
-- table exists for is actually reachable over a direct database connection.
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON TABLE private.legacy_oauth_bind_observations TO service_role;

-- The old app omits resource_uri and connection_id. Resolve the immutable
-- resource first, then preserve one connection from consumed code through root
-- refresh and child access inserts. Ambiguous parallel old flows fail closed.
CREATE OR REPLACE FUNCTION public.bind_legacy_oauth_insert_to_connection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resource_uri TEXT;
  v_connection_id UUID;
  v_parent_exists BOOLEAN := false;
  v_candidate_connections UUID[];
  v_had_parent BOOLEAN := false;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  v_resource_uri := private.get_mcp_environment_resource_uri_v1();

  IF NEW.resource_uri IS NULL THEN
    NEW.resource_uri := v_resource_uri;
  ELSIF NEW.resource_uri IS DISTINCT FROM v_resource_uri THEN
    RAISE EXCEPTION 'Invalid OAuth resource'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.connection_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.scopes && ARRAY[
    'write:plans',
    'delete:plans',
    'write:records',
    'delete:records'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'Legacy OAuth insert cannot carry write scopes'
      USING ERRCODE = '42501';
  END IF;

  -- PL/pgSQL resolves NEW fields against the trigger relation before boolean
  -- short-circuiting. Keep oauth_tokens-only fields in this nested branch.
  -- v_had_parent is set here (not read from NEW.parent_token_id again later)
  -- so the Stage 8-3 observation INSERT below never references a field that
  -- does not exist on the oauth_authorization_codes row type.
  IF TG_TABLE_NAME = 'oauth_tokens' THEN
    IF NEW.parent_token_id IS NOT NULL THEN
      v_had_parent := true;

      SELECT parent.connection_id, true
      INTO v_connection_id, v_parent_exists
      FROM public.oauth_tokens AS parent
      JOIN public.oauth_connections AS connection
        ON connection.id = parent.connection_id
      WHERE parent.id = NEW.parent_token_id
        AND parent.user_id = NEW.user_id
        AND parent.client_id = NEW.client_id
        AND parent.resource_uri = NEW.resource_uri
        AND NEW.scopes <@ connection.scopes;

      IF NOT v_parent_exists THEN
        RAISE EXCEPTION 'OAuth parent token binding is invalid'
          USING ERRCODE = '23503';
      END IF;
    ELSIF NEW.token_type = 'refresh' THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          NEW.user_id::TEXT || ':' || NEW.client_id || ':' || NEW.resource_uri,
          6174413826609021
        )
      );

      SELECT pg_catalog.array_agg(candidate.connection_id)
      INTO v_candidate_connections
      FROM (
        SELECT code.connection_id
        FROM public.oauth_authorization_codes AS code
        JOIN public.oauth_connections AS connection
          ON connection.id = code.connection_id
        WHERE code.user_id = NEW.user_id
          AND code.client_id = NEW.client_id
          AND code.resource_uri = NEW.resource_uri
          AND code.scopes = NEW.scopes
          AND code.consumed_at IS NOT NULL
          AND code.consumed_at >= pg_catalog.now() - INTERVAL '5 minutes'
          AND connection.legacy_read_only
          AND connection.revoked_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.oauth_tokens AS family_token
            WHERE family_token.connection_id = connection.id
          )
        GROUP BY code.connection_id
        ORDER BY max(code.consumed_at) DESC
        LIMIT 2
      ) AS candidate;

      IF COALESCE(pg_catalog.cardinality(v_candidate_connections), 0) > 1 THEN
        RAISE EXCEPTION 'Legacy OAuth code binding is ambiguous'
          USING ERRCODE = '23514';
      END IF;

      v_connection_id := v_candidate_connections[1];
    END IF;
  END IF;

  IF v_connection_id IS NULL THEN
    INSERT INTO public.oauth_connections (
      user_id,
      client_id,
      resource_uri,
      scopes,
      legacy_read_only
    ) VALUES (
      NEW.user_id,
      NEW.client_id,
      NEW.resource_uri,
      NEW.scopes,
      true
    )
    RETURNING id INTO v_connection_id;
  END IF;

  -- Stage 8-3 observation: reached exactly when the function backfills
  -- connection_id for a legacy insert (the trigger WHEN clause already
  -- guarantees NEW.connection_id was NULL on entry). This is the only
  -- behavior addition versus the 20260729073125 definition.
  INSERT INTO private.legacy_oauth_bind_observations (source_table, had_parent)
  VALUES (TG_TABLE_NAME, v_had_parent);

  NEW.connection_id := v_connection_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bind_legacy_oauth_insert_to_connection()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
