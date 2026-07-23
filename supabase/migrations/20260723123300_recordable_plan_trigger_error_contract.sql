-- Keep the cross-path trigger aligned with lock_recordable_plan_v1 while
-- legacy direct writers remain during the rolling ACL cutover.

CREATE OR REPLACE FUNCTION public.enforce_active_record_plan_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  SELECT plan.*
  INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = NEW.plan_id
    AND plan.user_id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_plan.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Linked Plan not found' USING ERRCODE = 'DT001';
  END IF;
  IF v_plan.end_at > pg_catalog.now() THEN
    RAISE EXCEPTION 'Future Plans cannot have linked Records' USING ERRCODE = 'DT013';
  END IF;
  IF v_plan.skipped_at IS NOT NULL THEN
    RAISE EXCEPTION 'Skipped Plans cannot have linked Records' USING ERRCODE = 'DT008';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_active_record_plan_v1()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enforce_active_record_plan_v1() IS
  'Keeps active linked Records attached only to an active, completed, non-skipped Plan.';
