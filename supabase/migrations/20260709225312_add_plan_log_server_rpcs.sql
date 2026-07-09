-- Add dormant server-layer RPCs for the split plans/logs model.

CREATE OR REPLACE FUNCTION public.soft_delete_plan(p_plan_id UUID, p_user_id UUID)
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

  UPDATE public.plans
  SET deleted_at = now()
  WHERE id = p_plan_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or already deleted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_plan(p_plan_id UUID, p_user_id UUID)
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

  UPDATE public.plans
  SET deleted_at = NULL
  WHERE id = p_plan_id AND user_id = p_user_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or not deleted';
  END IF;
END;
$$;

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
  WHERE id = p_log_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log not found or already deleted';
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
  WHERE id = p_log_id AND user_id = p_user_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log not found or not deleted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_day_plans_to_logs(
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_confirmed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS SETOF public.logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'confirm day range end must be after start'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH target_plans AS (
    SELECT p.*
    FROM public.plans p
    WHERE p.user_id = p_user_id
      AND p.deleted_at IS NULL
      AND p.skipped_at IS NULL
      AND p.end_at <= p_confirmed_at
      AND p.start_at >= p_start_at
      AND p.start_at < p_end_at
      AND NOT EXISTS (
        SELECT 1
        FROM public.logs l
        WHERE l.plan_id = p.id
          AND l.deleted_at IS NULL
      )
    ORDER BY p.start_at, p.id
  )
  INSERT INTO public.logs (
    user_id,
    tag_id,
    plan_id,
    external_calendar_event_id,
    title,
    note,
    start_at,
    end_at,
    source,
    created_at,
    updated_at
  )
  SELECT
    p.user_id,
    p.tag_id,
    p.id,
    NULL,
    p.title,
    p.note,
    p.start_at,
    p.end_at,
    'from_plan',
    p_confirmed_at,
    p_confirmed_at
  FROM target_plans p
  RETURNING public.logs.*;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_plan(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_plan(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_log(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_log(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_day_plans_to_logs(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.soft_delete_plan(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_plan(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_log(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_log(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_day_plans_to_logs(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated, service_role;
