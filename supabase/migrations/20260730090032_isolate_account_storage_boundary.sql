-- Storage owns its live-JWT policies and final zero-object assertion. It
-- consumes the stable auth-owned closing predicate without replacing the
-- generic auth.users trigger.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.authorize_owned_storage_write_v1()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = v_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(v_user_id);

  RETURN NOT private.account_is_closing_v1(v_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_owned_storage_read_v1()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.users AS app_user
      WHERE app_user.id = auth.uid()
    )
    AND NOT private.account_is_closing_v1(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.authorize_owned_storage_write_v1()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.authorize_owned_storage_read_v1()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_owned_storage_write_v1()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_owned_storage_read_v1()
  TO authenticated;


CREATE FUNCTION private.enforce_account_storage_deletion_boundary_v1()
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
      AND (storage.foldername(object.name))[1] = OLD.id::TEXT
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

CREATE TRIGGER enforce_account_storage_deletion_boundary
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION
    private.enforce_account_storage_deletion_boundary_v1();

COMMENT ON FUNCTION public.authorize_owned_storage_write_v1() IS
  'Authenticates the live JWT subject, holds the shared user fence, and consumes the stable account-closing predicate.';
COMMENT ON FUNCTION public.authorize_owned_storage_read_v1() IS
  'Rejects private Storage reads for a deleted or closing JWT subject through the stable account-closing predicate.';
COMMENT ON FUNCTION
  private.enforce_account_storage_deletion_boundary_v1() IS
  'Independently verifies the Storage step and indexed absence of account-owned objects at identity deletion.';

COMMIT;
