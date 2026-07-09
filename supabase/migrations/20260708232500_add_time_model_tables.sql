-- time-model-split Phase 1 schema foundation.
-- Adds the new Plan / Log tables without migrating or dropping entries.

CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;

-- =============================================================================
-- 1. Tables
-- =============================================================================

CREATE TABLE public.external_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_calendar_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  calendar_name TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT external_calendar_events_time_order CHECK (status = 'cancelled' OR end_at > start_at),
  CONSTRAINT external_calendar_events_active_shape CHECK (
    status = 'cancelled' OR (title IS NOT NULL AND start_at IS NOT NULL AND end_at IS NOT NULL)
  ),
  CONSTRAINT external_calendar_events_provider_not_blank CHECK (length(btrim(provider)) > 0),
  CONSTRAINT external_calendar_events_provider_calendar_id_not_blank CHECK (length(btrim(provider_calendar_id)) > 0),
  CONSTRAINT external_calendar_events_provider_event_id_not_blank CHECK (length(btrim(provider_event_id)) > 0),
  CONSTRAINT external_calendar_events_status_not_blank CHECK (length(btrim(status)) > 0)
);

CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  external_calendar_event_id UUID REFERENCES public.external_calendar_events(id),
  title TEXT NOT NULL,
  note TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  skipped_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plans_time_order CHECK (deleted_at IS NOT NULL OR end_at > start_at),
  CONSTRAINT plans_source_check CHECK (source IN ('manual', 'external_calendar', 'api')),
  CONSTRAINT plans_external_source_shape CHECK (
    (source = 'external_calendar') = (external_calendar_event_id IS NOT NULL)
  )
);

CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES public.plans(id),
  external_calendar_event_id UUID REFERENCES public.external_calendar_events(id),
  title TEXT NOT NULL,
  note TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  fulfillment_score INTEGER,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT logs_time_order CHECK (deleted_at IS NOT NULL OR end_at > start_at),
  CONSTRAINT logs_source_check CHECK (source IN ('manual', 'from_plan', 'external_calendar', 'api')),
  CONSTRAINT logs_from_plan_source_shape CHECK (source <> 'from_plan' OR plan_id IS NOT NULL),
  CONSTRAINT logs_external_source_shape CHECK (
    (source = 'external_calendar') = (external_calendar_event_id IS NOT NULL)
  ),
  CONSTRAINT logs_fulfillment_score_check CHECK (
    fulfillment_score IS NULL OR fulfillment_score BETWEEN 1 AND 3
  )
);

-- =============================================================================
-- 2. Constraints / indexes
-- =============================================================================

ALTER TABLE public.plans
  ADD CONSTRAINT plans_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (deleted_at IS NULL);

ALTER TABLE public.logs
  ADD CONSTRAINT logs_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX external_calendar_events_provider_event_unique
  ON public.external_calendar_events(user_id, provider, provider_calendar_id, provider_event_id);

CREATE INDEX external_calendar_events_user_time_idx
  ON public.external_calendar_events(user_id, start_at, end_at);

CREATE INDEX external_calendar_events_user_dismissed_idx
  ON public.external_calendar_events(user_id, dismissed_at)
  WHERE dismissed_at IS NULL;

CREATE INDEX plans_user_time_idx
  ON public.plans(user_id, start_at, end_at)
  WHERE deleted_at IS NULL;

CREATE INDEX plans_user_tag_idx
  ON public.plans(user_id, tag_id)
  WHERE deleted_at IS NULL AND tag_id IS NOT NULL;

CREATE INDEX plans_external_calendar_event_idx
  ON public.plans(external_calendar_event_id)
  WHERE external_calendar_event_id IS NOT NULL;

CREATE INDEX logs_user_time_idx
  ON public.logs(user_id, start_at, end_at)
  WHERE deleted_at IS NULL;

CREATE INDEX logs_user_tag_idx
  ON public.logs(user_id, tag_id)
  WHERE deleted_at IS NULL AND tag_id IS NOT NULL;

CREATE INDEX logs_plan_id_idx
  ON public.logs(plan_id)
  WHERE deleted_at IS NULL AND plan_id IS NOT NULL;

CREATE INDEX logs_external_calendar_event_idx
  ON public.logs(external_calendar_event_id)
  WHERE external_calendar_event_id IS NOT NULL;

CREATE INDEX logs_fulfillment_score_idx
  ON public.logs(fulfillment_score)
  WHERE fulfillment_score IS NOT NULL;

-- =============================================================================
-- 3. Owner / provenance triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_time_model_source_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION '%.source is immutable', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_plan_tag_owner()
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
    RAISE EXCEPTION 'plans.tag_id must reference a tag owned by the plan user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_log_tag_owner()
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
    RAISE EXCEPTION 'logs.tag_id must reference a tag owned by the log user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_log_plan_owner()
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
    RAISE EXCEPTION 'logs.plan_id must reference a plan owned by the log user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_plan_external_event_owner()
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
    RAISE EXCEPTION 'plans.external_calendar_event_id must reference an event owned by the plan user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_log_external_event_owner()
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
    RAISE EXCEPTION 'logs.external_calendar_event_id must reference an event owned by the log user'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_time_model_source_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_plan_tag_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_log_tag_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_log_plan_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_plan_external_event_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_log_external_event_owner() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prevent_time_model_source_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_plan_tag_owner() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_log_tag_owner() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_log_plan_owner() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_plan_external_event_owner() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_log_external_event_owner() TO service_role;


CREATE TRIGGER trigger_update_external_calendar_events_updated_at
  BEFORE UPDATE ON public.external_calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_update_logs_updated_at
  BEFORE UPDATE ON public.logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER prevent_plans_source_change
  BEFORE UPDATE OF source ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_time_model_source_change();

CREATE TRIGGER prevent_logs_source_change
  BEFORE UPDATE OF source ON public.logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_time_model_source_change();

CREATE CONSTRAINT TRIGGER enforce_plan_tag_owner
AFTER INSERT OR UPDATE OF user_id, tag_id ON public.plans
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.enforce_plan_tag_owner();

CREATE CONSTRAINT TRIGGER enforce_log_tag_owner
AFTER INSERT OR UPDATE OF user_id, tag_id ON public.logs
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.enforce_log_tag_owner();

CREATE CONSTRAINT TRIGGER enforce_log_plan_owner
AFTER INSERT OR UPDATE OF user_id, plan_id ON public.logs
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.enforce_log_plan_owner();

CREATE CONSTRAINT TRIGGER enforce_plan_external_event_owner
AFTER INSERT OR UPDATE OF user_id, external_calendar_event_id ON public.plans
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.enforce_plan_external_event_owner();

CREATE CONSTRAINT TRIGGER enforce_log_external_event_owner
AFTER INSERT OR UPDATE OF user_id, external_calendar_event_id ON public.logs
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.enforce_log_external_event_owner();

-- =============================================================================
-- 4. RLS / GRANT
-- =============================================================================

ALTER TABLE public.external_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.external_calendar_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.plans FROM PUBLIC, anon;
REVOKE ALL ON public.logs FROM PUBLIC, anon;

GRANT SELECT ON public.external_calendar_events TO authenticated;
GRANT UPDATE(dismissed_at) ON public.external_calendar_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_calendar_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logs TO authenticated, service_role;

CREATE POLICY "Users can view own external calendar events"
  ON public.external_calendar_events
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can dismiss own external calendar events"
  ON public.external_calendar_events
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Service role has full access to external calendar events"
  ON public.external_calendar_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own plans"
  ON public.plans
  FOR SELECT TO authenticated
  USING (((select auth.uid()) = user_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert own plans"
  ON public.plans
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own plans"
  ON public.plans
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own plans"
  ON public.plans
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role has full access to plans"
  ON public.plans
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own logs"
  ON public.logs
  FOR SELECT TO authenticated
  USING (((select auth.uid()) = user_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert own logs"
  ON public.logs
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own logs"
  ON public.logs
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own logs"
  ON public.logs
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role has full access to logs"
  ON public.logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
