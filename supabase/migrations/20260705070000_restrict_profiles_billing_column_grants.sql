-- Keep billing entitlement columns server-owned.
--
-- RLS can decide which rows a user may touch, but it cannot distinguish safe
-- profile fields from Stripe-controlled billing fields. Use column-level grants
-- so authenticated browser clients can edit only profile presentation fields.

BEGIN;

REVOKE INSERT, UPDATE ON TABLE public.profiles FROM authenticated;

GRANT INSERT (id, email, full_name, avatar_url)
  ON TABLE public.profiles
  TO authenticated;

GRANT UPDATE (full_name, avatar_url, updated_at)
  ON TABLE public.profiles
  TO authenticated;

GRANT INSERT, UPDATE ON TABLE public.profiles
  TO service_role;

COMMIT;
