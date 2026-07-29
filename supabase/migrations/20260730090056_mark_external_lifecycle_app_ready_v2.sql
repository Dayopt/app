-- This marker is deliberately the final Candidate 3 migration. Application
-- compatibility code must not use the new lifecycle until every repair and
-- retention function in this chain is present.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.get_external_lifecycle_app_version_v2()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 1;
$$;

REVOKE ALL ON FUNCTION public.get_external_lifecycle_app_version_v2()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_external_lifecycle_app_version_v2()
  TO service_role;

COMMENT ON FUNCTION public.get_external_lifecycle_app_version_v2() IS
  'Returns Candidate 3 application schema version 1 only after the full forward migration chain is installed; service role only.';

COMMIT;
