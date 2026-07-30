-- Candidate 4 adds the stored-grant half of the OAuth scope contract without
-- scanning legacy rows. PostgreSQL still enforces NOT VALID checks for every
-- new or updated row. Candidate 5 owns the read-only preflight and validation.
--
-- The three environment_resource_fkey constraints were already installed and
-- validated by Candidate 1. Keep those stronger constraints in place instead
-- of dropping or duplicating them for this staged rollout.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.oauth_connections
  ADD CONSTRAINT oauth_connections_write_requires_read_entries_check
  CHECK (
    NOT (
      scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    )
    OR scopes @> ARRAY['read:entries']::TEXT[]
  )
  NOT VALID;

ALTER TABLE public.oauth_authorization_codes
  ADD CONSTRAINT oauth_authorization_codes_write_requires_read_entries_check
  CHECK (
    NOT (
      scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    )
    OR scopes @> ARRAY['read:entries']::TEXT[]
  )
  NOT VALID;

ALTER TABLE public.oauth_tokens
  ADD CONSTRAINT oauth_tokens_write_requires_read_entries_check
  CHECK (
    NOT (
      scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    )
    OR scopes @> ARRAY['read:entries']::TEXT[]
  )
  NOT VALID;

COMMENT ON CONSTRAINT oauth_connections_write_requires_read_entries_check
  ON public.oauth_connections IS
  'Candidate 4 staged constraint: write and delete scopes extend read:entries; validate in Candidate 5.';
COMMENT ON CONSTRAINT oauth_authorization_codes_write_requires_read_entries_check
  ON public.oauth_authorization_codes IS
  'Candidate 4 staged constraint: write and delete scopes extend read:entries; validate in Candidate 5.';
COMMENT ON CONSTRAINT oauth_tokens_write_requires_read_entries_check
  ON public.oauth_tokens IS
  'Candidate 4 staged constraint: write and delete scopes extend read:entries; validate in Candidate 5.';

COMMIT;
