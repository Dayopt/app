-- Service-owned bulk counterpart to record_plan_command_v1. Eligible Plans are
-- locked before Records are created so record/skip races serialize on Plan rows.

CREATE FUNCTION public.confirm_day_plans_command_v1(
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_confirmed_at TIMESTAMPTZ DEFAULT pg_catalog.now()
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_confirmed_at CONSTANT TIMESTAMPTZ := LEAST(
    COALESCE(p_confirmed_at, pg_catalog.now()),
    pg_catalog.now()
  );
BEGIN
  IF p_end_at IS NULL OR p_start_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'Confirm day range end must be after start'
      USING ERRCODE = 'DT003';
  END IF;

  RETURN QUERY
  WITH target_plans AS MATERIALIZED (
    SELECT plan.*
    FROM public.plans AS plan
    WHERE plan.user_id = p_user_id
      AND plan.deleted_at IS NULL
      AND plan.skipped_at IS NULL
      AND plan.end_at <= v_confirmed_at
      AND plan.start_at >= p_start_at
      AND plan.start_at < p_end_at
      AND NOT EXISTS (
        SELECT 1
        FROM public.records AS record
        WHERE record.user_id = p_user_id
          AND record.plan_id = plan.id
          AND record.deleted_at IS NULL
      )
    ORDER BY plan.start_at, plan.id
    FOR UPDATE OF plan
  )
  INSERT INTO public.records (
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
    plan.user_id,
    plan.tag_id,
    plan.id,
    NULL,
    plan.title,
    plan.note,
    plan.start_at,
    plan.end_at,
    'from_plan',
    v_confirmed_at,
    v_confirmed_at
  FROM target_plans AS plan
  RETURNING public.records.*;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_day_plans_command_v1(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_day_plans_command_v1(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.confirm_day_plans_command_v1(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) IS 'Atomically records the current eligible Plans in a day range; service role only.';
