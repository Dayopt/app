-- The squashed baseline predates Supabase's default table grants. Production
-- retained these grants from the archived migration history, but a clean local
-- or Preview database did not, so RLS-protected clients failed before policies
-- could run. Recreate the production grants without widening profile writes.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE
    public.email_suppressions,
    public.mfa_recovery_codes,
    public.oauth_audit_log,
    public.oauth_authorization_codes,
    public.oauth_tokens,
    public.reports,
    public.stripe_webhook_events,
    public.tags,
    public.user_settings
  TO anon, authenticated, service_role;

-- Billing columns remain server-owned. Authenticated clients keep the
-- column-level INSERT / UPDATE grants defined in 20260705070000.
GRANT SELECT, DELETE
  ON TABLE public.profiles
  TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.profiles
  TO service_role;
