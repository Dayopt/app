-- time-model-split Phase 1 Step 2.
-- Backfill entries into plans/logs while keeping entries as the runtime source.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

ALTER TABLE public.logs
  DROP CONSTRAINT IF EXISTS logs_source_check;

ALTER TABLE public.logs
  ADD CONSTRAINT logs_source_check
  CHECK (source IN ('manual', 'from_plan', 'auto_migrated', 'external_calendar', 'api'));

ALTER POLICY "Users can insert own logs"
  ON public.logs
  WITH CHECK (((select auth.uid()) = user_id) AND source <> 'auto_migrated');

ALTER POLICY "Users can update own logs"
  ON public.logs
  USING (((select auth.uid()) = user_id) AND source <> 'auto_migrated')
  WITH CHECK (((select auth.uid()) = user_id) AND source <> 'auto_migrated');

ALTER POLICY "Users can delete own logs"
  ON public.logs
  USING (((select auth.uid()) = user_id) AND source <> 'auto_migrated');

CREATE OR REPLACE FUNCTION public.backfill_entries_to_plans_logs(
  p_backfill_now TIMESTAMPTZ DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_log_namespace CONSTANT UUID := '8f48b7ce-9362-5a4d-bf4c-65fcd4fe93e9';
  v_overlap_count INTEGER;
  v_expected_count INTEGER;
  v_actual_count INTEGER;
  v_missing_fk_count INTEGER;
BEGIN
  WITH projected_logs AS (
    SELECT
      e.id AS entry_id,
      e.user_id,
      e.actual_start_time AS start_at,
      e.actual_end_time AS end_at,
      'manual'::TEXT AS source
    FROM public.entries e
    WHERE e.deleted_at IS NULL
      AND e.origin = 'unplanned'
      AND e.actual_start_time IS NOT NULL
      AND e.actual_end_time IS NOT NULL

    UNION ALL

    SELECT
      e.id AS entry_id,
      e.user_id,
      e.actual_start_time AS start_at,
      e.actual_end_time AS end_at,
      'from_plan'::TEXT AS source
    FROM public.entries e
    WHERE e.deleted_at IS NULL
      AND e.origin = 'planned'
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
      AND e.actual_start_time IS NOT NULL
      AND e.actual_end_time IS NOT NULL

    UNION ALL

    SELECT
      e.id AS entry_id,
      e.user_id,
      e.start_time AS start_at,
      e.end_time AS end_at,
      'auto_migrated'::TEXT AS source
    FROM public.entries e
    WHERE e.deleted_at IS NULL
      AND e.origin = 'planned'
      AND e.actual_start_time IS NULL
      AND e.actual_end_time IS NULL
      AND e.skipped_at IS NULL
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
      AND e.end_time <= p_backfill_now
  ), effective_log_overlap_pairs AS (
    SELECT l2.entry_id AS delete_id
    FROM projected_logs l1
    JOIN projected_logs l2
      ON l1.user_id = l2.user_id
     AND l1.entry_id < l2.entry_id
     AND (l1.source = 'auto_migrated' OR l2.source = 'auto_migrated')
     AND tstzrange(l1.start_at, l1.end_at, '[)') && tstzrange(l2.start_at, l2.end_at, '[)')
  )
  UPDATE public.entries e
  SET deleted_at = now()
  WHERE e.id IN (SELECT delete_id FROM effective_log_overlap_pairs)
    AND e.deleted_at IS NULL;

  CREATE TEMP TABLE time_model_expected_plans ON COMMIT DROP AS
  SELECT
    e.id,
    e.user_id,
    e.tag_id,
    NULL::UUID AS external_calendar_event_id,
    e.title,
    e.description AS note,
    e.start_time AS start_at,
    e.end_time AS end_at,
    e.skipped_at,
    'manual'::TEXT AS source,
    e.deleted_at,
    e.created_at,
    e.updated_at
  FROM public.entries e
  WHERE e.origin = 'planned'
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL;

  CREATE TEMP TABLE time_model_expected_logs ON COMMIT DROP AS
  SELECT
    e.id,
    e.user_id,
    e.tag_id,
    NULL::UUID AS plan_id,
    NULL::UUID AS external_calendar_event_id,
    e.title,
    e.description AS note,
    e.actual_start_time AS start_at,
    e.actual_end_time AS end_at,
    'manual'::TEXT AS source,
    e.fulfillment_score,
    e.deleted_at,
    e.created_at,
    e.updated_at
  FROM public.entries e
  WHERE e.origin = 'unplanned'
    AND e.actual_start_time IS NOT NULL
    AND e.actual_end_time IS NOT NULL

  UNION ALL

  SELECT
    extensions.uuid_generate_v5(v_log_namespace, e.id::TEXT || ':log') AS id,
    e.user_id,
    e.tag_id,
    e.id AS plan_id,
    NULL::UUID AS external_calendar_event_id,
    e.title,
    e.description AS note,
    e.actual_start_time AS start_at,
    e.actual_end_time AS end_at,
    'from_plan'::TEXT AS source,
    e.fulfillment_score,
    e.deleted_at,
    e.created_at,
    e.updated_at
  FROM public.entries e
  WHERE e.origin = 'planned'
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL
    AND e.actual_start_time IS NOT NULL
    AND e.actual_end_time IS NOT NULL

  UNION ALL

  SELECT
    extensions.uuid_generate_v5(v_log_namespace, e.id::TEXT || ':log') AS id,
    e.user_id,
    e.tag_id,
    e.id AS plan_id,
    NULL::UUID AS external_calendar_event_id,
    e.title,
    e.description AS note,
    e.start_time AS start_at,
    e.end_time AS end_at,
    'auto_migrated'::TEXT AS source,
    e.fulfillment_score,
    e.deleted_at,
    e.created_at,
    e.updated_at
  FROM public.entries e
  WHERE e.origin = 'planned'
    AND e.actual_start_time IS NULL
    AND e.actual_end_time IS NULL
    AND e.skipped_at IS NULL
    AND e.start_time IS NOT NULL
    AND e.end_time IS NOT NULL
    AND e.end_time <= p_backfill_now;

  CREATE TEMP TABLE time_model_managed_plan_ids ON COMMIT DROP AS
  SELECT e.id
  FROM public.entries e;

  CREATE TEMP TABLE time_model_managed_log_ids ON COMMIT DROP AS
  SELECT e.id
  FROM public.entries e

  UNION

  SELECT extensions.uuid_generate_v5(v_log_namespace, e.id::TEXT || ':log') AS id
  FROM public.entries e;

  SELECT count(*)::INTEGER
  INTO v_overlap_count
  FROM pg_temp.time_model_expected_logs l1
  JOIN pg_temp.time_model_expected_logs l2
    ON l1.user_id = l2.user_id
   AND l1.id < l2.id
   AND l1.deleted_at IS NULL
   AND l2.deleted_at IS NULL
   AND tstzrange(l1.start_at, l1.end_at, '[)') && tstzrange(l2.start_at, l2.end_at, '[)');

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'time-model backfill would create % overlapping active logs', v_overlap_count
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.logs l
  USING pg_temp.time_model_managed_log_ids managed
  WHERE l.id = managed.id;

  DELETE FROM public.plans p
  USING pg_temp.time_model_managed_plan_ids managed
  WHERE p.id = managed.id;

  INSERT INTO public.plans (
    id,
    user_id,
    tag_id,
    external_calendar_event_id,
    title,
    note,
    start_at,
    end_at,
    skipped_at,
    source,
    deleted_at,
    created_at,
    updated_at
  )
  SELECT
    id,
    user_id,
    tag_id,
    external_calendar_event_id,
    title,
    note,
    start_at,
    end_at,
    skipped_at,
    source,
    deleted_at,
    created_at,
    updated_at
  FROM pg_temp.time_model_expected_plans;

  INSERT INTO public.logs (
    id,
    user_id,
    tag_id,
    plan_id,
    external_calendar_event_id,
    title,
    note,
    start_at,
    end_at,
    source,
    fulfillment_score,
    deleted_at,
    created_at,
    updated_at
  )
  SELECT
    id,
    user_id,
    tag_id,
    plan_id,
    external_calendar_event_id,
    title,
    note,
    start_at,
    end_at,
    source,
    fulfillment_score,
    deleted_at,
    created_at,
    updated_at
  FROM pg_temp.time_model_expected_logs;

  SELECT count(*)::INTEGER
  INTO v_expected_count
  FROM pg_temp.time_model_expected_plans;

  SELECT count(*)::INTEGER
  INTO v_actual_count
  FROM public.plans p
  JOIN pg_temp.time_model_expected_plans expected
    ON expected.id = p.id;

  IF v_actual_count <> v_expected_count THEN
    RAISE EXCEPTION 'time-model backfill plan count mismatch: expected %, got %', v_expected_count, v_actual_count
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::INTEGER
  INTO v_expected_count
  FROM pg_temp.time_model_expected_logs;

  SELECT count(*)::INTEGER
  INTO v_actual_count
  FROM public.logs l
  JOIN pg_temp.time_model_expected_logs expected
    ON expected.id = l.id;

  IF v_actual_count <> v_expected_count THEN
    RAISE EXCEPTION 'time-model backfill log count mismatch: expected %, got %', v_expected_count, v_actual_count
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::INTEGER
  INTO v_missing_fk_count
  FROM pg_temp.time_model_expected_logs expected
  LEFT JOIN public.plans p
    ON p.id = expected.plan_id
  WHERE expected.plan_id IS NOT NULL
    AND p.id IS NULL;

  IF v_missing_fk_count > 0 THEN
    RAISE EXCEPTION 'time-model backfill missing plan references: %', v_missing_fk_count
      USING ERRCODE = '23514';
  END IF;

  DROP TABLE pg_temp.time_model_expected_plans;
  DROP TABLE pg_temp.time_model_expected_logs;
  DROP TABLE pg_temp.time_model_managed_plan_ids;
  DROP TABLE pg_temp.time_model_managed_log_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_entries_to_plans_logs(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_entries_to_plans_logs(TIMESTAMPTZ) TO service_role;

SELECT public.backfill_entries_to_plans_logs();
