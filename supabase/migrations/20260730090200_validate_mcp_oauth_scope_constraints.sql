-- Candidate 5 finishes the stored-grant half of the OAuth scope contract that
-- Candidate 4 staged as NOT VALID. It runs a read-only preflight over the three
-- OAuth tables and then validates the three staged CHECK constraints, so the
-- contract also covers rows that predate Candidate 4.
--
-- The preflight predicate is the exact negation of the Candidate 4 CHECK
-- expression. A validation scan would fail on the same rows, but with a generic
-- PostgreSQL message; stopping first keeps the failure actionable without
-- reporting any row identity.
--
-- The three environment_resource_fkey constraints were already installed and
-- validated by Candidate 1. Candidate 5 does not touch, drop, or duplicate
-- them, and it changes no GRANT, RLS policy, or OAuth function.
--
-- The runtime guard that rejects write scopes without read:entries already
-- lives in 20260729073125_mcp_environment_identity_client_fence.sql. This
-- migration only advances the stored-row constraint state and does not
-- reimplement that check.
--
-- MCP write tools stay unreachable: writes_enabled = false AND
-- enabled_client_ids = [] is untouched here.

BEGIN;

SET LOCAL lock_timeout = '5s';
-- VALIDATE CONSTRAINT holds SHARE UPDATE EXCLUSIVE for a full table scan on
-- each OAuth table, so allow more than the 30s Candidate 4 used for the
-- metadata-only NOT VALID additions.
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. Read-only preflight
-- =============================================================================
-- Revoking a write-only grant does not repair its stored scopes, so a revoked
-- row still fails validation. Report counts only: no user id, client id,
-- token hash, or scope value leaves this block.

DO $$
DECLARE
  v_write_scopes CONSTANT TEXT[] := ARRAY[
    'write:plans',
    'delete:plans',
    'write:records',
    'delete:records'
  ]::TEXT[];
  v_read_scope CONSTANT TEXT[] := ARRAY['read:entries']::TEXT[];
  v_connection_violations BIGINT;
  v_authorization_code_violations BIGINT;
  v_token_violations BIGINT;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_connection_violations
  FROM public.oauth_connections
  WHERE scopes && v_write_scopes
    AND NOT (scopes @> v_read_scope);

  SELECT pg_catalog.count(*)
  INTO v_authorization_code_violations
  FROM public.oauth_authorization_codes
  WHERE scopes && v_write_scopes
    AND NOT (scopes @> v_read_scope);

  SELECT pg_catalog.count(*)
  INTO v_token_violations
  FROM public.oauth_tokens
  WHERE scopes && v_write_scopes
    AND NOT (scopes @> v_read_scope);

  IF v_connection_violations > 0
    OR v_authorization_code_violations > 0
    OR v_token_violations > 0
  THEN
    RAISE EXCEPTION
      'OAuth write-only rows must be repaired or removed under an explicit consent-safe remediation before the base-read constraint is validated; revocation alone is insufficient (oauth_connections: % rows, oauth_authorization_codes: % rows, oauth_tokens: % rows)',
      v_connection_violations,
      v_authorization_code_violations,
      v_token_violations
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- =============================================================================
-- 2. Validate the staged checks
-- =============================================================================

ALTER TABLE public.oauth_connections
  VALIDATE CONSTRAINT oauth_connections_write_requires_read_entries_check;

ALTER TABLE public.oauth_authorization_codes
  VALIDATE CONSTRAINT oauth_authorization_codes_write_requires_read_entries_check;

ALTER TABLE public.oauth_tokens
  VALIDATE CONSTRAINT oauth_tokens_write_requires_read_entries_check;

-- =============================================================================
-- 3. Replace the Candidate 4 staging comments
-- =============================================================================
-- The staged comments announced a pending Candidate 5 validation. Restate them
-- as the validated contract so the catalog does not describe stale intent.

COMMENT ON CONSTRAINT oauth_connections_write_requires_read_entries_check
  ON public.oauth_connections IS
  'Validated in Candidate 5: write and delete scopes extend read:entries for every stored row.';
COMMENT ON CONSTRAINT oauth_authorization_codes_write_requires_read_entries_check
  ON public.oauth_authorization_codes IS
  'Validated in Candidate 5: write and delete scopes extend read:entries for every stored row.';
COMMENT ON CONSTRAINT oauth_tokens_write_requires_read_entries_check
  ON public.oauth_tokens IS
  'Validated in Candidate 5: write and delete scopes extend read:entries for every stored row.';

COMMIT;
