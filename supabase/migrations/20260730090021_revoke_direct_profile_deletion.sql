-- Keep the billing identity mapping until the privileged account-deletion
-- workflow has closed Stripe and deleted auth.users. RLS alone is not enough:
-- authenticated previously held the table-level DELETE privilege and could
-- remove its own profile before the cleanup workflow observed the Customer.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;

REVOKE DELETE ON TABLE public.profiles FROM anon, authenticated;

COMMIT;
