-- Keep the RPC behavior aligned with logs RLS and enforce one active log per plan.

CREATE UNIQUE INDEX logs_one_active_per_plan_idx
  ON public.logs(plan_id)
  WHERE deleted_at IS NULL AND plan_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.soft_delete_log(p_log_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  UPDATE public.logs
  SET deleted_at = now()
  WHERE id = p_log_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
    AND (source <> 'auto_migrated' OR auth.role() = 'service_role');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log not found, already deleted, or protected';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_log(p_log_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  UPDATE public.logs
  SET deleted_at = NULL
  WHERE id = p_log_id
    AND user_id = p_user_id
    AND deleted_at IS NOT NULL
    AND (source <> 'auto_migrated' OR auth.role() = 'service_role');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log not found, not deleted, or protected';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_log(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_log(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.soft_delete_log(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_log(UUID, UUID) TO authenticated, service_role;
