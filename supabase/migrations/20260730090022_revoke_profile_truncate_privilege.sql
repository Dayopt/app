-- RLS does not apply to TRUNCATE. Browser roles do not need this privilege on
-- the profile table that carries the Stripe Customer identity.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE TRUNCATE ON TABLE public.profiles FROM anon, authenticated;

DO $$
BEGIN
  IF pg_catalog.has_table_privilege(
      'anon',
      'public.profiles',
      'TRUNCATE'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.profiles',
      'TRUNCATE'
    ) THEN
    RAISE EXCEPTION 'Browser role still has profile TRUNCATE privilege'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMIT;
