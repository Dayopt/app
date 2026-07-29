-- Publish a terminal, read-only compatibility marker only after every
-- Candidate 3 lifecycle migration has committed. Mixed-version app instances
-- use the absence of this function to keep the predecessor behavior.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.get_external_lifecycle_app_version_v1()
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT 1;
$$;

REVOKE ALL ON FUNCTION public.get_external_lifecycle_app_version_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_external_lifecycle_app_version_v1()
  TO service_role;

COMMENT ON FUNCTION public.get_external_lifecycle_app_version_v1() IS
  'Returns Candidate 3 terminal schema version 1; service role only.';

COMMIT;
