-- Tags and user settings still have authenticated direct writers. A rare
-- full-data purge takes coarse table locks for those two relations so their
-- existing writers cannot commit between the DELETE statements and purge
-- commit. SHARE ROW EXCLUSIVE avoids lock-upgrade deadlocks between two purges.

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

  LOCK TABLE public.tags, public.user_settings IN SHARE ROW EXCLUSIVE MODE;

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

COMMENT ON FUNCTION public.delete_all_user_data_command_v1(UUID) IS
  'Atomically deletes one user''s Plans, Records, tags, and settings while serializing their known writers; service role only.';

