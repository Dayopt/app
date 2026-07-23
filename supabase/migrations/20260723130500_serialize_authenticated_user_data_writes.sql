-- Replace the coarse cross-tenant table lock with a per-user statement guard
-- for the remaining authenticated tag/settings writers. BEFORE STATEMENT is
-- required so the advisory lock always precedes tuple locks.

CREATE FUNCTION private.lock_authenticated_user_data_write_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'authenticated' THEN
    RETURN NULL;
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user id is missing'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(v_user_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.lock_authenticated_user_data_write_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trigger_lock_authenticated_tag_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.tags
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.lock_authenticated_user_data_write_v1();

CREATE TRIGGER trigger_lock_authenticated_user_settings_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_settings
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.lock_authenticated_user_data_write_v1();

CREATE OR REPLACE FUNCTION public.delete_all_user_data_command_v1(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  DELETE FROM public.records
  WHERE user_id = p_user_id;

  DELETE FROM public.plans
  WHERE user_id = p_user_id;

  DELETE FROM public.tags
  WHERE user_id = p_user_id;

  DELETE FROM public.user_settings
  WHERE user_id = p_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_all_user_data_command_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_all_user_data_command_v1(UUID)
  TO service_role;

COMMENT ON FUNCTION private.lock_authenticated_user_data_write_v1() IS
  'Takes the same-user shared data lock before authenticated tag/settings statement tuple locks.';
COMMENT ON FUNCTION public.delete_all_user_data_command_v1(UUID) IS
  'Atomically deletes one user''s Plans, Records, tags, and settings under the same-user exclusive data lock; service role only.';

