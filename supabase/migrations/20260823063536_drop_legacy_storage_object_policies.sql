-- Drop legacy Storage RLS policies that coexist with the hardened
-- authorize_owned_storage_*_v1 policies on storage.objects (#2316).
--
-- Root cause: `_archive/20251024022910_remote_schema.sql` (avatar, role
-- `public`) and `_archive/20251218072948_create_attachments_bucket.sql`
-- (attachments, role `authenticated`) created 8 policies whose names were
-- never dropped by any later migration. `20260730090027_fence_account_storage.sql`
-- only dropped/recreated the "own" (not "their own") names, so both sets
-- coexist as PERMISSIVE policies on the same commands and get OR-combined.
-- The legacy predicates check ownership only — not
-- authorize_owned_storage_write_v1() / read_v1() — so a request that fails
-- the account-closing fence can still succeed through the legacy policy.
-- Confirmed present in production by direct inspection (issue #2316 body).
--
-- storage.objects has no other application-defined policies (see
-- STORAGE_OBJECTS_APP_POLICY_NAMES in scripts/generate-rls-snapshot.ts and
-- docs/engineering/data/db/rls-snapshot.md), so the guards below use a
-- simple named-policy count rather than parsing predicate text.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Fail closed if the hardened policies are somehow not all present yet.
-- Dropping the legacy policies first would remove the only remaining
-- access path for avatar/attachment operations.
DO $$
DECLARE
  v_hardened_count INT;
BEGIN
  SELECT count(*) INTO v_hardened_count
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname IN (
      'Users can upload own avatar',
      'Users can update own avatar',
      'Users can delete own avatar',
      'Users can view own avatar',
      'Users can upload own attachments',
      'Users can update own attachments',
      'Users can delete own attachments',
      'Users can view own attachments'
    );

  IF v_hardened_count <> 8 THEN
    RAISE EXCEPTION
      'Expected 8 hardened storage.objects policies before dropping legacy '
      'ones, found %. Aborting to avoid removing the only remaining access '
      'path for avatar/attachment operations.',
      v_hardened_count;
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload attachments to their folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own attachments" ON storage.objects;

-- Fail closed if anything other than exactly the 8 hardened policies
-- remains (a 9th orphan, or a hardened policy unexpectedly missing).
DO $$
DECLARE
  v_total_count INT;
  v_hardened_count INT;
BEGIN
  SELECT count(*) INTO v_total_count
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects';

  SELECT count(*) INTO v_hardened_count
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname IN (
      'Users can upload own avatar',
      'Users can update own avatar',
      'Users can delete own avatar',
      'Users can view own avatar',
      'Users can upload own attachments',
      'Users can update own attachments',
      'Users can delete own attachments',
      'Users can view own attachments'
    );

  IF v_total_count <> 8 OR v_hardened_count <> 8 THEN
    RAISE EXCEPTION
      'Expected exactly the 8 hardened storage.objects policies after '
      'dropping legacy ones, found % total (% hardened).',
      v_total_count, v_hardened_count;
  END IF;
END $$;

COMMIT;
