-- Candidate 6 expand step: route every authenticated Plan / Record write through
-- the service-owned typed command boundary by removing direct table DML.
--
-- Promote only after the command-based application deployment is live. The
-- application change is deployable on its own, so this migration follows it.
--
-- Deliberately kept in place:
--   * authenticated SELECT on plans / records. Read paths stay on the Data API.
--   * authenticated EXECUTE on soft_delete_plan / soft_delete_record /
--     confirm_day_plans_to_records. Those three are SECURITY DEFINER wrappers
--     that verify auth.uid() ownership, and the not-yet-drained old bundle still
--     calls them. Their EXECUTE is revoked in a later drain migration, not here.
--
-- Deliberately closed: authenticated kept TRUNCATE (and MAINTAIN) on both
-- tables from the baseline default ACL. TRUNCATE bypasses RLS entirely, so
-- REVOKE ALL PRIVILEGES is what actually shuts the latent path.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE ALL PRIVILEGES ON TABLE public.plans FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.records FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.plans TO authenticated;
GRANT SELECT ON TABLE public.records TO authenticated;

-- Fail the migration if a table- or column-level capability still lets browser
-- clients bypass the typed command boundary, or if the three legacy wrappers
-- lost the compatibility EXECUTE the old bundle depends on. Reading the
-- catalogs also covers newer PostgreSQL privileges such as MAINTAIN, which a
-- hard-coded privilege list would silently miss.
DO $$
DECLARE
  v_anon_oid OID := 'anon'::REGROLE::OID;
  v_authenticated_oid OID := 'authenticated'::REGROLE::OID;
BEGIN
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.plans', 'SELECT')
    OR NOT pg_catalog.has_table_privilege('authenticated', 'public.records', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated Plan / Record SELECT privilege is missing'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('plans', 'records')
      AND (
        acl.grantee IN (0::OID, v_anon_oid)
        OR (
          acl.grantee = v_authenticated_oid
          AND acl.privilege_type <> 'SELECT'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Public, anon, or authenticated timeblock table capability remains'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('plans', 'records')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND (
        acl.grantee IN (0::OID, v_anon_oid)
        OR (
          acl.grantee = v_authenticated_oid
          AND acl.privilege_type <> 'SELECT'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Public, anon, or authenticated timeblock column capability remains'
      USING ERRCODE = '42501';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.soft_delete_plan(uuid,uuid)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.soft_delete_record(uuid,uuid)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.confirm_day_plans_to_records(uuid,timestamptz,timestamptz,timestamptz)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'Legacy timeblock RPC compatibility for authenticated is missing'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMIT;
