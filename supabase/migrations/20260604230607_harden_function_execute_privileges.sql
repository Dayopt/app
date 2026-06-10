-- Supabase Pro security advisor hardening.
--
-- Goals:
-- - Do not expose public RPC functions to anon/PUBLIC by default.
-- - Keep only app-facing RPCs callable by authenticated users.
-- - Keep service-only tables intentionally inaccessible to browser clients.

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

DO $$
DECLARE
  fn text;
  target regprocedure;
  authenticated_functions text[] := ARRAY[
    'public.use_recovery_code(uuid,text)',
    'public.count_unused_recovery_codes(uuid)',
    'public.update_personalization(uuid,text,jsonb)',
    'public.batch_reorder_tags_hierarchy(uuid,uuid[],uuid[],integer[])',
    'public.batch_rename_tags(uuid,uuid[],text[])',
    'public.rename_tag_group(uuid,text,text)',
    'public.merge_tags(uuid,uuid,uuid)',
    'public.merge_tags(uuid,uuid[],uuid)',
    'public.merge_tags_with_hierarchy(uuid,uuid,uuid)',
    'public.get_tag_stats(uuid)',
    'public.bulk_soft_delete_entries(uuid[],uuid)',
    'public.soft_delete_entry(uuid,uuid)',
    'public.restore_entry(uuid,uuid)',
    'public.get_time_by_tag(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_daily_hours(uuid,integer)',
    'public.get_hourly_distribution(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_dow_distribution(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_monthly_hours(uuid,integer)',
    'public.get_energy_map(uuid,date,date)',
    'public.get_active_dates(uuid,date,date)',
    'public.get_plan_rate(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_estimation_accuracy(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_context_switches(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_blank_rate(uuid,timestamp with time zone,timestamp with time zone,integer,integer)',
    'public.get_cumulative_time(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_avg_fulfillment(uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_stats_kpi_summary(uuid,timestamp with time zone,timestamp with time zone,integer,integer)',
    'public.get_time_pl_data(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,integer)',
    'public.get_stats_page_data(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,integer,integer,integer)',
    'public.get_timeboxing_adherence(uuid,date,date)',
    'public.get_total_time(uuid)',
    'public.get_weekly_focus_score(uuid,integer)',
    'public.get_tag_cumulative_time(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_avg_fulfillment(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_plan_rate(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_fulfillment_distribution(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_hourly_distribution(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_dow_distribution(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_child_tag_breakdown(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_accuracy_trend(uuid,uuid,timestamp with time zone,timestamp with time zone,text)',
    'public.get_tag_recent_entries(uuid,uuid,integer)'
  ];
BEGIN
  FOREACH fn IN ARRAY authenticated_functions LOOP
    target := to_regprocedure(fn);
    IF target IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', target);
    END IF;
  END LOOP;

  target := to_regprocedure('public.custom_access_token_hook(jsonb)');
  IF target IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO supabase_auth_admin', target);
  END IF;

  target := to_regprocedure('public.update_personalization(uuid,text,jsonb)');
  IF target IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', target);
  END IF;

  target := to_regprocedure('public.trunc_week_tz(timestamp with time zone,text,integer)');
  IF target IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', target);
  END IF;
END $$;

CREATE POLICY "No browser client access"
  ON public.email_suppressions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "No browser client access"
  ON public.oauth_authorization_codes
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "No browser client access"
  ON public.stripe_webhook_events
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.email_suppressions IS
  'Service-role only suppression list populated by Resend webhook handling. Browser clients are denied by RLS.';
COMMENT ON TABLE public.oauth_authorization_codes IS
  'Service-role only OAuth PKCE intermediate state. Browser clients are denied by RLS.';
COMMENT ON TABLE public.stripe_webhook_events IS
  'Service-role only Stripe webhook idempotency table. Browser clients are denied by RLS.';

UPDATE storage.buckets
SET public = false
WHERE id = 'attachments';
