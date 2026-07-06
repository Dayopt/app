-- Mirror the profiles write hardening for anon. RLS already denies these paths,
-- but column privileges should not expose billing entitlement writes to browser
-- roles in the first place.

BEGIN;

REVOKE INSERT, UPDATE ON TABLE public.profiles FROM anon;

COMMIT;
