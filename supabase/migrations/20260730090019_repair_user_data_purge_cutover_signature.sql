-- Forward-only repair for the immediately following unpublished cutover
-- migration: remove the first v5 overload and install a non-executable shim
-- with the signature that 20260726060700 removes. Both migrations deploy in
-- the same release and no application version calls either three-argument
-- overload.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION public.delete_all_user_data_command_v5(UUID, TEXT, UUID);

CREATE FUNCTION public.delete_all_user_data_command_v5(
  p_project_key TEXT,
  p_operation_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Superseded purge overload is not executable'
    USING ERRCODE = '0A000';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_all_user_data_command_v5(
  TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
