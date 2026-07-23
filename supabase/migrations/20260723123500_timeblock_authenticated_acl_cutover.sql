-- Route authenticated Plan / Record writes through the service-owned typed
-- command boundary. This migration must only be promoted after the command
-- based application deployment is live and older direct-writer deployments
-- have drained.

REVOKE ALL PRIVILEGES ON TABLE public.plans FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.records FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.plans TO authenticated;
GRANT SELECT ON TABLE public.records TO authenticated;

-- Retire the three pre-command browser write paths. Keep service_role EXECUTE
-- for rolling-deploy recovery; current application code uses *_command_v1.
REVOKE EXECUTE ON FUNCTION public.soft_delete_plan(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_record(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_day_plans_to_records(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.soft_delete_plan(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_record(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_day_plans_to_records(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

-- Fail the migration if a table-, column-, or routine-level capability still
-- lets authenticated clients bypass the typed command boundary. Querying the
-- catalogs also covers newer PostgreSQL table privileges such as MAINTAIN.
DO $$
DECLARE
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
      AND acl.grantee = v_authenticated_oid
      AND acl.privilege_type <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Authenticated Plan / Record table write privilege remains'
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
      AND acl.grantee = v_authenticated_oid
      AND acl.privilege_type <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Authenticated Plan / Record column write privilege remains'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.has_function_privilege(
      'authenticated',
      'public.soft_delete_plan(uuid,uuid)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.soft_delete_record(uuid,uuid)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.confirm_day_plans_to_records(uuid,timestamptz,timestamptz,timestamptz)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'Authenticated legacy timeblock RPC privilege remains'
      USING ERRCODE = '42501';
  END IF;
END;
$$;
