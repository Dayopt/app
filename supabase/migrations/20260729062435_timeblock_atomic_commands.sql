-- Shared atomic Plan / Record mutation boundary for the browser UI and MCP.
-- Commands are service-owned, typed per operation, and use exact PostgreSQL
-- timestamps for compare-and-swap. Existing exclusion constraints remain the
-- final authority for same-lane overlap races.

-- =============================================================================
-- 1. Cross-path domain invariants
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Block Plan/Record writers before rechecking the invariant in the same
-- transaction that installs the new triggers. This prevents the old app from
-- creating an invalid skipped-Plan/active-Record pair between check and cutover.
LOCK TABLE
  public.plans,
  public.records
IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.records AS record
    JOIN public.plans AS plan
      ON plan.id = record.plan_id
      AND plan.user_id = record.user_id
    WHERE record.deleted_at IS NULL
      AND plan.skipped_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Active Records linked to skipped Plans require operator review'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION public.validate_plan_temporal_write_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF NEW.end_at <= NEW.start_at THEN
    RAISE EXCEPTION 'Plan end must be after start' USING ERRCODE = 'DT003';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Local/Preview seed fixtures are inserted by the database owner after all
    -- migrations. Preserve historical sample Plans without weakening the
    -- authenticated or service-role application boundary.
    IF NEW.end_at <= v_now
      AND SESSION_USER NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Plans must end in the future' USING ERRCODE = 'DT004';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.start_at IS DISTINCT FROM OLD.start_at
    OR NEW.end_at IS DISTINCT FROM OLD.end_at THEN
    IF OLD.end_at <= v_now THEN
      RAISE EXCEPTION 'Past plan time is locked' USING ERRCODE = 'DT006';
    END IF;
    IF NEW.end_at <= v_now THEN
      RAISE EXCEPTION 'Plans must end in the future' USING ERRCODE = 'DT004';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_record_temporal_write_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.end_at <= NEW.start_at THEN
    RAISE EXCEPTION 'Record end must be after start' USING ERRCODE = 'DT003';
  END IF;

  IF (TG_OP = 'INSERT'
      OR NEW.start_at IS DISTINCT FROM OLD.start_at
      OR NEW.end_at IS DISTINCT FROM OLD.end_at)
    AND NEW.end_at > pg_catalog.now()
    AND SESSION_USER NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Records cannot end in the future' USING ERRCODE = 'DT005';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.enforce_active_record_plan_v1()
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
    RAISE EXCEPTION 'Future Plans cannot have linked Records' USING ERRCODE = 'DT005';
  END IF;
  IF v_plan.skipped_at IS NOT NULL THEN
    RAISE EXCEPTION 'Skipped Plans cannot have linked Records' USING ERRCODE = 'DT008';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.enforce_plan_skip_record_invariant_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.skipped_at IS NULL OR NEW.skipped_at IS NOT DISTINCT FROM OLD.skipped_at THEN
    RETURN NEW;
  END IF;

  IF NEW.end_at > pg_catalog.now() THEN
    RAISE EXCEPTION 'Future Plans cannot be skipped' USING ERRCODE = 'DT007';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.records AS record
    WHERE record.user_id = NEW.user_id
      AND record.plan_id = NEW.id
      AND record.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Plan already has an active Record' USING ERRCODE = 'DT011';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_plan_temporal_write_v1
  BEFORE INSERT OR UPDATE OF start_at, end_at ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_plan_temporal_write_v1();

CREATE TRIGGER validate_record_temporal_write_v1
  BEFORE INSERT OR UPDATE OF start_at, end_at ON public.records
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_record_temporal_write_v1();

CREATE TRIGGER enforce_active_record_plan_v1
  BEFORE INSERT OR UPDATE OF plan_id, deleted_at ON public.records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_record_plan_v1();

CREATE TRIGGER enforce_plan_skip_record_invariant_v1
  BEFORE UPDATE OF skipped_at ON public.plans
  FOR EACH ROW
  WHEN (NEW.skipped_at IS NOT NULL AND NEW.skipped_at IS DISTINCT FROM OLD.skipped_at)
  EXECUTE FUNCTION public.enforce_plan_skip_record_invariant_v1();

-- =============================================================================
-- 2. Shared validation helpers
-- =============================================================================

CREATE FUNCTION public.assert_timeblock_content_v1(p_title TEXT, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_title IS NULL OR length(p_title) = 0 OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'Invalid timeblock title' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 10000 THEN
    RAISE EXCEPTION 'Invalid timeblock note' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE FUNCTION public.assert_active_timeblock_tag_v1(p_user_id UUID, p_tag_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_tag_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.tags AS tag
  WHERE tag.id = p_tag_id
    AND tag.user_id = p_user_id
    AND tag.is_active
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tag not found' USING ERRCODE = 'DT001';
  END IF;
END;
$$;

CREATE FUNCTION public.assert_timeblock_external_event_v1(
  p_user_id UUID,
  p_external_calendar_event_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_external_calendar_event_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.external_calendar_events AS event
  WHERE event.id = p_external_calendar_event_id
    AND event.user_id = p_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'External calendar event not found' USING ERRCODE = 'DT001';
  END IF;
END;
$$;

CREATE FUNCTION public.lock_recordable_plan_v1(p_user_id UUID, p_plan_id UUID)
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
    RAISE EXCEPTION 'Future Plans cannot have linked Records' USING ERRCODE = 'DT005';
  END IF;
  IF v_plan.skipped_at IS NOT NULL THEN
    RAISE EXCEPTION 'Skipped Plans cannot have linked Records' USING ERRCODE = 'DT008';
  END IF;

  RETURN v_plan;
END;
$$;

-- =============================================================================
-- 3. Plan commands
-- =============================================================================

CREATE FUNCTION public.create_plan_command_v1(
  p_user_id UUID,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_external_calendar_event_id UUID,
  p_source TEXT,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  PERFORM public.assert_timeblock_external_event_v1(
    p_user_id,
    p_external_calendar_event_id
  );

  IF p_source <> ALL (ARRAY['manual', 'external_calendar', 'api']::TEXT[])
    OR ((p_source = 'external_calendar') IS DISTINCT FROM
        (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Plan source shape' USING ERRCODE = 'DT012';
  END IF;

  RETURN QUERY
  INSERT INTO public.plans (
    user_id, title, note, tag_id, external_calendar_event_id,
    source, start_at, end_at
  ) VALUES (
    p_user_id, p_title, p_note, p_tag_id, p_external_calendar_event_id,
    p_source, p_start_at, p_end_at
  )
  RETURNING public.plans.*;
END;
$$;

CREATE FUNCTION public.update_plan_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_external_calendar_event_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS SETOF public.plans
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
    AND plan.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Plan version conflict' USING ERRCODE = 'DT002';
  END IF;

  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  IF p_tag_id IS DISTINCT FROM v_plan.tag_id THEN
    PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  END IF;
  IF p_external_calendar_event_id IS DISTINCT FROM v_plan.external_calendar_event_id THEN
    PERFORM public.assert_timeblock_external_event_v1(
      p_user_id,
      p_external_calendar_event_id
    );
  END IF;
  IF ((v_plan.source = 'external_calendar') IS DISTINCT FROM
      (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Plan source shape' USING ERRCODE = 'DT012';
  END IF;

  IF ROW(
    p_title, p_note, p_tag_id, p_external_calendar_event_id, p_start_at, p_end_at
  ) IS NOT DISTINCT FROM ROW(
    v_plan.title,
    v_plan.note,
    v_plan.tag_id,
    v_plan.external_calendar_event_id,
    v_plan.start_at,
    v_plan.end_at
  ) THEN
    RETURN NEXT v_plan;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.plans
  SET title = p_title,
      note = p_note,
      tag_id = p_tag_id,
      external_calendar_event_id = p_external_calendar_event_id,
      start_at = p_start_at,
      end_at = p_end_at
  WHERE id = p_plan_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.plans.*;
END;
$$;

CREATE FUNCTION public.delete_plan_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  SELECT plan.* INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = p_user_id
    AND plan.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Plan version conflict' USING ERRCODE = 'DT002';
  END IF;

  RETURN QUERY
  UPDATE public.plans
  SET deleted_at = pg_catalog.now()
  WHERE id = p_plan_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.plans.*;
END;
$$;

CREATE FUNCTION public.restore_plan_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  SELECT plan.* INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = p_user_id
    AND plan.deleted_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Plan version conflict' USING ERRCODE = 'DT002';
  END IF;

  RETURN QUERY
  UPDATE public.plans
  SET deleted_at = NULL
  WHERE id = p_plan_id
    AND user_id = p_user_id
    AND deleted_at IS NOT NULL
  RETURNING public.plans.*;
END;
$$;

CREATE FUNCTION public.set_plan_skipped_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_skipped BOOLEAN
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  SELECT plan.* INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = p_user_id
    AND plan.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Plan version conflict' USING ERRCODE = 'DT002';
  END IF;

  IF p_skipped AND v_plan.end_at > pg_catalog.now() THEN
    RAISE EXCEPTION 'Future Plans cannot be skipped' USING ERRCODE = 'DT007';
  END IF;
  IF p_skipped AND EXISTS (
    SELECT 1 FROM public.records AS record
    WHERE record.user_id = p_user_id
      AND record.plan_id = p_plan_id
      AND record.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Plan already has an active Record' USING ERRCODE = 'DT011';
  END IF;

  IF (p_skipped AND v_plan.skipped_at IS NOT NULL)
    OR (NOT p_skipped AND v_plan.skipped_at IS NULL) THEN
    RETURN NEXT v_plan;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.plans
  SET skipped_at = CASE WHEN p_skipped THEN pg_catalog.now() ELSE NULL END
  WHERE id = p_plan_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.plans.*;
END;
$$;

-- =============================================================================
-- 4. Record commands
-- =============================================================================

CREATE FUNCTION public.create_record_command_v1(
  p_user_id UUID,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_plan_id UUID,
  p_external_calendar_event_id UUID,
  p_source TEXT,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  PERFORM public.assert_timeblock_external_event_v1(
    p_user_id,
    p_external_calendar_event_id
  );
  IF p_plan_id IS NOT NULL THEN
    PERFORM public.lock_recordable_plan_v1(p_user_id, p_plan_id);
  END IF;

  IF p_source <> ALL (ARRAY['manual', 'from_plan', 'external_calendar', 'api']::TEXT[])
    OR (p_source = 'from_plan' AND p_plan_id IS NULL)
    OR ((p_source = 'external_calendar') IS DISTINCT FROM
        (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Record source shape' USING ERRCODE = 'DT012';
  END IF;

  RETURN QUERY
  INSERT INTO public.records (
    user_id, title, note, tag_id, plan_id, external_calendar_event_id,
    source, start_at, end_at
  ) VALUES (
    p_user_id, p_title, p_note, p_tag_id, p_plan_id,
    p_external_calendar_event_id, p_source, p_start_at, p_end_at
  )
  RETURNING public.records.*;
END;
$$;

CREATE FUNCTION public.update_record_command_v1(
  p_user_id UUID,
  p_record_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_plan_id UUID,
  p_external_calendar_event_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan_hint UUID;
  v_record public.records%ROWTYPE;
BEGIN
  SELECT record.plan_id INTO v_plan_hint
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;

  IF p_plan_id IS DISTINCT FROM v_plan_hint AND p_plan_id IS NOT NULL THEN
    PERFORM public.lock_recordable_plan_v1(p_user_id, p_plan_id);
  END IF;

  SELECT record.* INTO v_record
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NULL
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
  IF v_record.source = 'from_plan' AND p_plan_id IS NULL THEN
    RAISE EXCEPTION 'from_plan Record requires a Plan' USING ERRCODE = 'DT012';
  END IF;
  IF ((v_record.source = 'external_calendar') IS DISTINCT FROM
      (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Record source shape' USING ERRCODE = 'DT012';
  END IF;

  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  IF p_tag_id IS DISTINCT FROM v_record.tag_id THEN
    PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  END IF;
  IF p_external_calendar_event_id IS DISTINCT FROM v_record.external_calendar_event_id THEN
    PERFORM public.assert_timeblock_external_event_v1(
      p_user_id,
      p_external_calendar_event_id
    );
  END IF;

  IF ROW(
    p_title,
    p_note,
    p_tag_id,
    p_plan_id,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at
  ) IS NOT DISTINCT FROM ROW(
    v_record.title,
    v_record.note,
    v_record.tag_id,
    v_record.plan_id,
    v_record.external_calendar_event_id,
    v_record.start_at,
    v_record.end_at
  ) THEN
    RETURN NEXT v_record;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.records
  SET title = p_title,
      note = p_note,
      tag_id = p_tag_id,
      plan_id = p_plan_id,
      external_calendar_event_id = p_external_calendar_event_id,
      start_at = p_start_at,
      end_at = p_end_at
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.records.*;
END;
$$;

CREATE FUNCTION public.delete_record_command_v1(
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
  v_record public.records%ROWTYPE;
BEGIN
  SELECT record.* INTO v_record
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_record.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Record version conflict' USING ERRCODE = 'DT002';
  END IF;
  IF v_record.source = 'auto_migrated' THEN
    RAISE EXCEPTION 'Migrated Record is immutable' USING ERRCODE = 'DT009';
  END IF;

  RETURN QUERY
  UPDATE public.records
  SET deleted_at = pg_catalog.now()
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.records.*;
END;
$$;

CREATE FUNCTION public.restore_record_command_v1(
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
  v_plan_hint UUID;
  v_record public.records%ROWTYPE;
BEGIN
  SELECT record.plan_id INTO v_plan_hint
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;
  IF v_plan_hint IS NOT NULL THEN
    PERFORM public.lock_recordable_plan_v1(p_user_id, v_plan_hint);
  END IF;

  SELECT record.* INTO v_record
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

CREATE FUNCTION public.record_plan_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  v_plan := public.lock_recordable_plan_v1(p_user_id, p_plan_id);

  IF p_expected_updated_at IS NULL
    OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Plan version conflict' USING ERRCODE = 'DT002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.records AS record
    WHERE record.user_id = p_user_id
      AND record.plan_id = p_plan_id
      AND record.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Plan already has an active Record' USING ERRCODE = 'DT011';
  END IF;

  RETURN QUERY
  INSERT INTO public.records (
    user_id, title, note, tag_id, plan_id, external_calendar_event_id,
    source, start_at, end_at
  ) VALUES (
    p_user_id,
    v_plan.title,
    v_plan.note,
    v_plan.tag_id,
    v_plan.id,
    NULL,
    'from_plan',
    v_plan.start_at,
    v_plan.end_at
  )
  RETURNING public.records.*;
END;
$$;

-- =============================================================================
-- 5. Deny-by-default function grants
-- =============================================================================

REVOKE ALL ON FUNCTION public.validate_plan_temporal_write_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_record_temporal_write_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_active_record_plan_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_plan_skip_record_invariant_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_timeblock_content_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_active_timeblock_tag_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_timeblock_external_event_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_recordable_plan_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_plan_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_plan_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_plan_skipped_command_v1(UUID, UUID, TIMESTAMPTZ, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_record_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_record_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_timeblock_content_v1(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_active_timeblock_tag_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_timeblock_external_event_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_recordable_plan_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_plan_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_plan_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_plan_skipped_command_v1(UUID, UUID, TIMESTAMPTZ, BOOLEAN)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_record_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_record_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;

COMMIT;
