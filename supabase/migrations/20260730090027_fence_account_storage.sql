-- Serialize authenticated Storage mutations with the account-closing gate,
-- reject stale-JWT access, and make the auth.users trigger independently
-- verify that neither account-owned bucket retains metadata.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.authorize_owned_storage_write_v1()
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

  -- A Storage transaction that wins this parent lock may finish first. The
  -- generic begin then waits, commits its gate, and sweeps that object.
  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = v_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(v_user_id);

  RETURN NOT EXISTS (
    SELECT 1
    FROM private.account_deletion_operations AS operation
    WHERE operation.user_id = v_user_id
  );
END;
$$;

CREATE FUNCTION public.authorize_owned_storage_read_v1()
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
    AND NOT EXISTS (
      SELECT 1
      FROM private.account_deletion_operations AS operation
      WHERE operation.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.authorize_owned_storage_write_v1()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.authorize_owned_storage_read_v1()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_owned_storage_write_v1()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_owned_storage_read_v1()
  TO authenticated;

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own attachments" ON storage.objects;

CREATE POLICY "Users can upload own avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND public.authorize_owned_storage_write_v1()
);

CREATE POLICY "Users can update own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND public.authorize_owned_storage_write_v1()
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND public.authorize_owned_storage_write_v1()
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND public.authorize_owned_storage_write_v1()
);

CREATE POLICY "Users can view own avatar"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND public.authorize_owned_storage_read_v1()
);

CREATE POLICY "Users can upload own attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND public.authorize_owned_storage_write_v1()
);

CREATE POLICY "Users can update own attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND public.authorize_owned_storage_write_v1()
)
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND public.authorize_owned_storage_write_v1()
);

CREATE POLICY "Users can delete own attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND public.authorize_owned_storage_write_v1()
);

CREATE POLICY "Users can view own attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND public.authorize_owned_storage_read_v1()
);

CREATE OR REPLACE FUNCTION private.enforce_account_deletion_boundary_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operation private.account_deletion_operations%ROWTYPE;
  v_current_customer_id TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM private.account_deletion_control AS control
    WHERE control.singleton
      AND control.activation_version = 1
      AND control.activated_at IS NOT NULL
  ) THEN
    RETURN OLD;
  END IF;

  PERFORM private.lock_timeblock_user_write_exclusive_v1(OLD.id);

  SELECT operation.*
  INTO v_operation
  FROM private.account_deletion_operations AS operation
  WHERE operation.user_id = OLD.id
    AND operation.state = 'ready'
    AND operation.ready_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account deletion operation is not ready'
      USING ERRCODE = 'AD019';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.account_deletion_steps AS step
    WHERE step.user_id = OLD.id
      AND step.state <> 'completed'
  )
  OR EXISTS (
    SELECT 1
    FROM private.billing_mutation_claims AS claim
    WHERE claim.user_id = OLD.id
      AND claim.state = 'active'
  ) THEN
    RAISE EXCEPTION 'Account deletion work remains incomplete'
      USING ERRCODE = 'AD019';
  END IF;

  SELECT profile.stripe_customer_id
  INTO v_current_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = OLD.id
  FOR UPDATE;

  IF NOT FOUND
    OR v_current_customer_id
      IS DISTINCT FROM v_operation.stripe_customer_id_snapshot THEN
    RAISE EXCEPTION 'Billing identity changed before account deletion'
      USING ERRCODE = 'AD014';
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

REVOKE ALL ON FUNCTION private.enforce_account_deletion_boundary_v1()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.authorize_owned_storage_write_v1() IS
  'Authenticates the JWT subject, holds the shared user fence, and rejects writes after generic account deletion begins.';
COMMENT ON FUNCTION public.authorize_owned_storage_read_v1() IS
  'Rejects private Storage reads for a deleted or closing JWT subject.';

COMMIT;
