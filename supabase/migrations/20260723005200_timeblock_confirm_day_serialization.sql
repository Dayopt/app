-- Re-check linked Records after acquiring each Plan lock. This closes the
-- READ COMMITTED snapshot gap between confirm-day and one-tap/UI recording.

CREATE OR REPLACE FUNCTION public.confirm_day_plans_command_v1(
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
  v_plan public.plans%ROWTYPE;
  v_record public.records%ROWTYPE;
BEGIN
  IF p_end_at IS NULL OR p_start_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'Confirm day range end must be after start'
      USING ERRCODE = 'DT003';
  END IF;

  -- Each EXISTS is a separate statement after the Plan lock. Under READ
  -- COMMITTED it sees a linked Record committed while this transaction waited.
  FOR v_plan IN
    SELECT plan.*
    FROM public.plans AS plan
    WHERE plan.user_id = p_user_id
      AND plan.deleted_at IS NULL
      AND plan.skipped_at IS NULL
      AND plan.end_at <= v_confirmed_at
      AND plan.start_at >= p_start_at
      AND plan.start_at < p_end_at
    ORDER BY plan.start_at, plan.id
    FOR UPDATE OF plan
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1
      FROM public.records AS record
      WHERE record.user_id = p_user_id
        AND record.plan_id = v_plan.id
        AND record.deleted_at IS NULL
    );

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
    ) VALUES (
      v_plan.user_id,
      v_plan.tag_id,
      v_plan.id,
      NULL,
      v_plan.title,
      v_plan.note,
      v_plan.start_at,
      v_plan.end_at,
      'from_plan',
      v_confirmed_at,
      v_confirmed_at
    )
    RETURNING public.records.* INTO v_record;

    RETURN NEXT v_record;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.confirm_day_plans_command_v1(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) IS 'Atomically records eligible Plans after locking and re-checking each linked Record; service role only.';
