-- Separate a future linked Plan from a future Record in the stable domain
-- error contract. Both previously raised DT005, which made MCP clients report
-- a valid past Record as if the Record itself ended in the future.

CREATE OR REPLACE FUNCTION public.lock_recordable_plan_v1(
  p_user_id UUID,
  p_plan_id UUID
)
RETURNS public.plans
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  SELECT plan.*
  INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_plan.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;
  IF v_plan.end_at > pg_catalog.now() THEN
    RAISE EXCEPTION 'Future Plans cannot have linked Records' USING ERRCODE = 'DT013';
  END IF;
  IF v_plan.skipped_at IS NOT NULL THEN
    RAISE EXCEPTION 'Skipped Plans cannot have linked Records' USING ERRCODE = 'DT008';
  END IF;

  RETURN v_plan;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_recordable_plan_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_recordable_plan_v1(UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.lock_recordable_plan_v1(UUID, UUID) IS
  'Locks and returns one active, completed, non-skipped Plan that may receive a linked Record.';
