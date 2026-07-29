-- Preserve the current UI contract during DB-first rollout: a Record that was
-- already linked to a Plan may be restored after that Plan is soft-deleted.
-- New links and relinks still require an active, completed, non-skipped Plan.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION private.restore_record_unserialized_v1(
  p_user_id UUID,
  p_record_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
  v_plan_hint UUID;
  v_record public.records%ROWTYPE;
BEGIN
  SELECT record.plan_id
  INTO v_plan_hint
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;

  IF v_plan_hint IS NOT NULL THEN
    SELECT plan.*
    INTO v_plan
    FROM public.plans AS plan
    WHERE plan.id = v_plan_hint
      AND plan.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
    END IF;
    IF v_plan.end_at > pg_catalog.now() THEN
      RAISE EXCEPTION 'Future Plans cannot have linked Records'
        USING ERRCODE = 'DT013';
    END IF;
    IF v_plan.skipped_at IS NOT NULL THEN
      RAISE EXCEPTION 'Skipped Plans cannot have linked Records'
        USING ERRCODE = 'DT008';
    END IF;
  END IF;

  SELECT record.*
  INTO v_record
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;
  IF v_record.plan_id IS DISTINCT FROM v_plan_hint
    OR p_expected_updated_at IS NULL
    OR v_record.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Record version conflict' USING ERRCODE = 'DT002';
  END IF;
  IF v_record.source = 'auto_migrated' THEN
    RAISE EXCEPTION 'Migrated Record is immutable' USING ERRCODE = 'DT009';
  END IF;

  RETURN QUERY
  UPDATE public.records
  SET deleted_at = NULL
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NOT NULL
  RETURNING public.records.*;
END;
$$;

REVOKE ALL ON FUNCTION private.restore_record_unserialized_v1(
  UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_active_record_plan_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
  v_restoring_existing_link BOOLEAN;
BEGIN
  IF NEW.plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id
    AND (
      NEW.deleted_at IS NOT NULL
      OR NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
    ) THEN
    RETURN NEW;
  END IF;

  v_restoring_existing_link := TG_OP = 'UPDATE'
    AND OLD.deleted_at IS NOT NULL
    AND NEW.deleted_at IS NULL
    AND NEW.plan_id IS NOT NULL
    AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id;

  SELECT plan.*
  INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = NEW.plan_id
    AND plan.user_id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND
    OR (v_plan.deleted_at IS NOT NULL AND NOT v_restoring_existing_link) THEN
    RAISE EXCEPTION 'Linked Plan not found' USING ERRCODE = 'DT001';
  END IF;

  IF v_plan.end_at > pg_catalog.now()
    AND SESSION_USER NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Future Plans cannot have linked Records' USING ERRCODE = 'DT013';
  END IF;

  IF v_plan.skipped_at IS NOT NULL THEN
    RAISE EXCEPTION 'Skipped Plans cannot have linked Records' USING ERRCODE = 'DT008';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_active_record_plan_v1()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
