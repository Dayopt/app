-- Prevent direct authenticated RPC calls from confirming plans in the future.

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
DECLARE
  v_confirmed_at CONSTANT TIMESTAMPTZ := LEAST(COALESCE(p_confirmed_at, now()), now());
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
      AND p.end_at <= v_confirmed_at
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
    v_confirmed_at,
    v_confirmed_at
  FROM target_plans p
  RETURNING public.logs.*;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_day_plans_to_logs(
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.confirm_day_plans_to_logs(
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) TO authenticated, service_role;
