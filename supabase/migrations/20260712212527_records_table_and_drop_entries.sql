-- time-model-split Step 9b: logs -> records rename and entries removal.
-- CASCADE is intentionally avoided so an unknown dependency stops the migration.

-- Capture plans that crossed into the past after the one-time backfill.
-- If the current app already created an explicit record for the plan, keep that
-- record as the source of truth instead of synthesizing an auto-migrated row.
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
  extensions.uuid_generate_v5(
    '8f48b7ce-9362-5a4d-bf4c-65fcd4fe93e9'::UUID,
    e.id::TEXT || ':log'
  ),
  p.user_id,
  p.tag_id,
  p.id,
  p.external_calendar_event_id,
  p.title,
  p.note,
  p.start_at,
  p.end_at,
  'auto_migrated',
  NULL,
  p.deleted_at,
  p.created_at,
  p.updated_at
FROM public.entries e
JOIN public.plans p
  ON p.id = e.id
 AND p.user_id = e.user_id
WHERE e.origin = 'planned'
  AND e.actual_start_time IS NULL
  AND e.actual_end_time IS NULL
  AND p.skipped_at IS NULL
  AND p.start_at IS NOT NULL
  AND p.end_at IS NOT NULL
  AND p.end_at <= now()
  AND NOT EXISTS (
    SELECT 1
    FROM public.logs existing
    WHERE existing.user_id = p.user_id
      AND existing.deleted_at IS NULL
      AND (
        (existing.plan_id = p.id AND existing.source <> 'auto_migrated')
        OR tstzrange(existing.start_at, existing.end_at, '[)')
          && tstzrange(p.start_at, p.end_at, '[)')
      )
  )
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_missing_plans INTEGER;
  v_missing_records INTEGER;
  v_invalid_plan_refs INTEGER;
BEGIN
  SELECT count(*)::INTEGER
  INTO v_missing_plans
  FROM public.entries e
  LEFT JOIN public.plans p ON p.id = e.id
  WHERE e.origin = 'planned'
    AND (p.id IS NULL OR p.user_id IS DISTINCT FROM e.user_id);

  IF v_missing_plans > 0 THEN
    RAISE EXCEPTION 'Step 9b preflight found % entries without matching plans', v_missing_plans
      USING ERRCODE = '23514';
  END IF;

  WITH expected_records AS (
    SELECT
      CASE
        WHEN e.origin = 'unplanned' THEN e.id
        ELSE extensions.uuid_generate_v5(
          '8f48b7ce-9362-5a4d-bf4c-65fcd4fe93e9'::UUID,
          e.id::TEXT || ':log'
        )
      END AS id,
      e.user_id,
      CASE WHEN e.origin = 'planned' THEN e.id ELSE NULL END AS plan_id,
      CASE
        WHEN e.origin = 'unplanned' THEN 'manual'
        WHEN e.actual_start_time IS NOT NULL THEN 'from_plan'
        ELSE 'auto_migrated'
      END AS source
    FROM public.entries e
    LEFT JOIN public.plans p
      ON p.id = e.id
     AND p.user_id = e.user_id
    WHERE
      (
        e.origin = 'unplanned'
        AND e.actual_start_time IS NOT NULL
        AND e.actual_end_time IS NOT NULL
      )
      OR (
        e.origin = 'planned'
        AND e.actual_start_time IS NOT NULL
        AND e.actual_end_time IS NOT NULL
      )
      OR (
        e.origin = 'planned'
        AND e.actual_start_time IS NULL
        AND e.actual_end_time IS NULL
        AND p.skipped_at IS NULL
        AND p.start_at IS NOT NULL
        AND p.end_at IS NOT NULL
        AND p.end_at <= now()
        AND NOT EXISTS (
          SELECT 1
          FROM public.logs existing
          WHERE existing.user_id = p.user_id
            AND existing.deleted_at IS NULL
            AND (
              (existing.plan_id = p.id AND existing.source <> 'auto_migrated')
              OR tstzrange(existing.start_at, existing.end_at, '[)')
                && tstzrange(p.start_at, p.end_at, '[)')
            )
        )
      )
  )
  SELECT count(*)::INTEGER
  INTO v_missing_records
  FROM expected_records expected
  LEFT JOIN public.logs l ON l.id = expected.id
  WHERE
    l.id IS NULL
    OR l.user_id IS DISTINCT FROM expected.user_id
    OR l.plan_id IS DISTINCT FROM expected.plan_id
    OR l.source IS DISTINCT FROM expected.source;

  IF v_missing_records > 0 THEN
    RAISE EXCEPTION 'Step 9b preflight found % entries without matching records', v_missing_records
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::INTEGER
  INTO v_invalid_plan_refs
  FROM public.logs l
  LEFT JOIN public.plans p ON p.id = l.plan_id
  WHERE l.plan_id IS NOT NULL
    AND (p.id IS NULL OR p.user_id IS DISTINCT FROM l.user_id);

  IF v_invalid_plan_refs > 0 THEN
    RAISE EXCEPTION 'Step 9b preflight found % invalid record plan references', v_invalid_plan_refs
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- Drop the retired entries API with exact signatures before its row type and view.
DROP FUNCTION public.auto_shrink_neighbors(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION public.backfill_entries_to_plans_logs(TIMESTAMPTZ);
DROP FUNCTION public.bulk_soft_delete_entries(UUID[], UUID);
DROP FUNCTION public.get_active_dates(UUID, DATE, DATE);
DROP FUNCTION public.get_active_users_for_reflection(DATE, INTEGER, INTEGER);
DROP FUNCTION public.get_blank_rate(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER);
DROP FUNCTION public.get_daily_hours(UUID, INTEGER);
DROP FUNCTION public.get_dow_distribution(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION public.get_estimation_accuracy(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION public.get_fulfillment_trend(UUID, DATE, DATE);
DROP FUNCTION public.get_hourly_distribution(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION public.get_monthly_hours(UUID, INTEGER);
DROP FUNCTION public.get_plan_summary(UUID);
DROP FUNCTION public.get_stats_kpi_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER);
DROP FUNCTION public.get_stats_page_data(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, INTEGER, INTEGER
);
DROP FUNCTION public.get_tag_stats(UUID);
DROP FUNCTION public.get_time_by_tag(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION public.get_time_pl_data(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER
);
DROP FUNCTION public.get_timeboxing_adherence(UUID, DATE, DATE);
DROP FUNCTION public.get_total_time(UUID);
DROP FUNCTION public.get_weekly_focus_score(UUID, INTEGER);
DROP FUNCTION public.merge_tags(UUID, UUID, UUID);
DROP FUNCTION public.restore_entry(UUID, UUID);
DROP FUNCTION public.soft_delete_entry(UUID, UUID);

DROP VIEW public.entries_effective;
DROP TABLE public.entries;
DROP FUNCTION public.enforce_entry_tag_owner();

-- Recreate row-type-returning RPCs after the physical table rename.
DROP FUNCTION public.confirm_day_plans_to_logs(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION public.restore_log(UUID, UUID);
DROP FUNCTION public.soft_delete_log(UUID, UUID);

ALTER TABLE public.logs RENAME TO records;

ALTER TABLE public.records RENAME CONSTRAINT logs_pkey TO records_pkey;
ALTER TABLE public.records
  RENAME CONSTRAINT logs_external_calendar_event_id_fkey TO records_external_calendar_event_id_fkey;
ALTER TABLE public.records RENAME CONSTRAINT logs_plan_id_fkey TO records_plan_id_fkey;
ALTER TABLE public.records RENAME CONSTRAINT logs_tag_id_fkey TO records_tag_id_fkey;
ALTER TABLE public.records RENAME CONSTRAINT logs_user_id_fkey TO records_user_id_fkey;
ALTER TABLE public.records RENAME CONSTRAINT logs_external_source_shape TO records_external_source_shape;
ALTER TABLE public.records RENAME CONSTRAINT logs_from_plan_source_shape TO records_from_plan_source_shape;
ALTER TABLE public.records RENAME CONSTRAINT logs_fulfillment_score_check TO records_fulfillment_score_check;
ALTER TABLE public.records RENAME CONSTRAINT logs_no_overlap TO records_no_overlap;
ALTER TABLE public.records RENAME CONSTRAINT logs_source_check TO records_source_check;
ALTER TABLE public.records RENAME CONSTRAINT logs_time_order TO records_time_order;
ALTER TABLE public.records RENAME CONSTRAINT enforce_log_tag_owner TO enforce_record_tag_owner;
ALTER TABLE public.records RENAME CONSTRAINT enforce_log_plan_owner TO enforce_record_plan_owner;
ALTER TABLE public.records
  RENAME CONSTRAINT enforce_log_external_event_owner TO enforce_record_external_event_owner;

ALTER INDEX public.logs_external_calendar_event_idx RENAME TO records_external_calendar_event_idx;
ALTER INDEX public.logs_fulfillment_score_idx RENAME TO records_fulfillment_score_idx;
ALTER INDEX public.logs_one_active_from_plan_per_plan_idx
  RENAME TO records_one_active_from_plan_per_plan_idx;
ALTER INDEX public.logs_plan_id_idx RENAME TO records_plan_id_idx;
ALTER INDEX public.logs_user_tag_idx RENAME TO records_user_tag_idx;
ALTER INDEX public.logs_user_time_idx RENAME TO records_user_time_idx;

ALTER TRIGGER prevent_logs_source_change ON public.records RENAME TO prevent_records_source_change;
ALTER TRIGGER trigger_update_logs_updated_at ON public.records
  RENAME TO trigger_update_records_updated_at;

ALTER FUNCTION public.enforce_log_tag_owner() RENAME TO enforce_record_tag_owner;
ALTER FUNCTION public.enforce_log_plan_owner() RENAME TO enforce_record_plan_owner;
ALTER FUNCTION public.enforce_log_external_event_owner() RENAME TO enforce_record_external_event_owner;

CREATE OR REPLACE FUNCTION public.enforce_record_tag_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.tag_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tags
    WHERE tags.id = NEW.tag_id
      AND tags.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'records.tag_id must reference a tag owned by the record user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_record_plan_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.plans
    WHERE plans.id = NEW.plan_id
      AND plans.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'records.plan_id must reference a plan owned by the record user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_record_external_event_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.external_calendar_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.external_calendar_events
    WHERE external_calendar_events.id = NEW.external_calendar_event_id
      AND external_calendar_events.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'records.external_calendar_event_id must reference an event owned by the record user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER POLICY "Users can view own logs" ON public.records RENAME TO "Users can view own records";
ALTER POLICY "Users can insert own logs" ON public.records RENAME TO "Users can insert own records";
ALTER POLICY "Users can update own logs" ON public.records RENAME TO "Users can update own records";
ALTER POLICY "Users can delete own logs" ON public.records RENAME TO "Users can delete own records";
ALTER POLICY "Service role has full access to logs" ON public.records
  RENAME TO "Service role has full access to records";

CREATE OR REPLACE FUNCTION public.soft_delete_record(p_record_id UUID, p_user_id UUID)
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

  UPDATE public.records
  SET deleted_at = now()
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
    AND (source <> 'auto_migrated' OR auth.role() = 'service_role');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found, already deleted, or protected';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_record(p_record_id UUID, p_user_id UUID)
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

  UPDATE public.records
  SET deleted_at = NULL
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NOT NULL
    AND (source <> 'auto_migrated' OR auth.role() = 'service_role');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found, not deleted, or protected';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_day_plans_to_records(
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_confirmed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS SETOF public.records
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
        SELECT 1 FROM public.records r
        WHERE r.plan_id = p.id AND r.deleted_at IS NULL
      )
    ORDER BY p.start_at, p.id
  )
  INSERT INTO public.records (
    user_id, tag_id, plan_id, external_calendar_event_id, title, note,
    start_at, end_at, source, created_at, updated_at
  )
  SELECT
    p.user_id, p.tag_id, p.id, NULL, p.title, p.note,
    p.start_at, p.end_at, 'from_plan', v_confirmed_at, v_confirmed_at
  FROM target_plans p
  RETURNING public.records.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_tags_with_hierarchy(
  p_user_id UUID,
  p_source_tag_id UUID,
  p_target_tag_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_migrated_count INTEGER := 0;
  v_row_count INTEGER := 0;
  v_target_parent_id UUID;
  v_children_count INTEGER := 0;
  v_next_sort_order INTEGER;
BEGIN
  IF p_user_id != (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  IF p_source_tag_id = p_target_tag_id THEN
    RAISE EXCEPTION 'Cannot merge a tag with itself' USING ERRCODE = 'P0001';
  END IF;

  SELECT parent_id INTO v_target_parent_id
  FROM public.tags
  WHERE id = p_target_tag_id AND user_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target tag not found or inactive: %', p_target_tag_id
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.tags
  WHERE id = p_source_tag_id AND user_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source tag not found or inactive: %', p_source_tag_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO v_children_count
  FROM public.tags
  WHERE user_id = p_user_id AND parent_id = p_source_tag_id AND is_active = true;

  IF v_children_count > 0 AND v_target_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot merge a parent tag into a child tag.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.plans SET tag_id = p_target_tag_id
  WHERE user_id = p_user_id AND tag_id = p_source_tag_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_migrated_count := v_migrated_count + v_row_count;

  UPDATE public.records SET tag_id = p_target_tag_id
  WHERE user_id = p_user_id AND tag_id = p_source_tag_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_migrated_count := v_migrated_count + v_row_count;

  IF v_children_count > 0 THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_next_sort_order
    FROM public.tags
    WHERE user_id = p_user_id AND parent_id = p_target_tag_id;

    UPDATE public.tags AS t
    SET parent_id = p_target_tag_id,
        sort_order = v_next_sort_order + sub.idx,
        updated_at = NOW()
    FROM (
      SELECT id, (ROW_NUMBER() OVER (ORDER BY sort_order, id) - 1)::INTEGER AS idx
      FROM public.tags
      WHERE user_id = p_user_id
        AND parent_id = p_source_tag_id
        AND is_active = true
    ) sub
    WHERE t.id = sub.id AND t.user_id = p_user_id;
  END IF;

  UPDATE public.tags SET is_active = false, updated_at = NOW()
  WHERE id = p_source_tag_id AND user_id = p_user_id;

  RETURN json_build_object(
    'migrated', v_migrated_count,
    'children_reparented', v_children_count
  );
END;
$$;

-- A simple security-invoker view remains updatable and reuses records RLS.
CREATE VIEW public.logs
WITH (security_invoker = true)
AS SELECT * FROM public.records
WITH LOCAL CHECK OPTION;

REVOKE ALL ON public.logs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logs TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.soft_delete_log(p_log_id UUID, p_user_id UUID)
RETURNS void LANGUAGE sql SET search_path = public
AS $$ SELECT public.soft_delete_record(p_log_id, p_user_id); $$;

CREATE OR REPLACE FUNCTION public.restore_log(p_log_id UUID, p_user_id UUID)
RETURNS void LANGUAGE sql SET search_path = public
AS $$ SELECT public.restore_record(p_log_id, p_user_id); $$;

CREATE OR REPLACE FUNCTION public.confirm_day_plans_to_logs(
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_confirmed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS SETOF public.records
LANGUAGE sql
SET search_path = public
AS $$
  SELECT * FROM public.confirm_day_plans_to_records(
    p_user_id, p_start_at, p_end_at, p_confirmed_at
  );
$$;

REVOKE ALL ON FUNCTION public.soft_delete_record(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_record(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_day_plans_to_records(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_log(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_log(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_day_plans_to_logs(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.soft_delete_record(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_record(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_day_plans_to_records(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_log(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_log(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_day_plans_to_logs(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated, service_role;
