-- Use the managed Storage service's existing (bucket_id, name COLLATE "C")
-- index. Hosted Supabase forbids adding indexes to storage.objects.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION
  private.enforce_account_storage_deletion_boundary_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_generic_deletion_id UUID;
BEGIN
  SELECT operation.deletion_id
  INTO v_generic_deletion_id
  FROM private.account_deletion_operations AS operation
  WHERE operation.user_id = OLD.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(OLD.id);

  IF NOT EXISTS (
    SELECT 1
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = OLD.id
      AND step.deletion_id = v_generic_deletion_id
      AND step.step = 'storage'
      AND step.state = 'completed'
  ) THEN
    RAISE EXCEPTION 'Account Storage deletion step is incomplete'
      USING ERRCODE = 'AD019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id IN ('avatars', 'attachments')
      AND object.name COLLATE "C"
        >= (OLD.id::TEXT || '/') COLLATE "C"
      AND object.name COLLATE "C"
        < (OLD.id::TEXT || '0') COLLATE "C"
  ) THEN
    RAISE EXCEPTION 'Account Storage objects remain at identity deletion'
      USING ERRCODE = 'AD015';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION
  private.enforce_account_storage_deletion_boundary_v1()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION
  private.enforce_account_storage_deletion_boundary_v1() IS
  'Independently verifies the Storage step and uses the managed prefix index to prove no account-owned object metadata remains.';

COMMIT;
