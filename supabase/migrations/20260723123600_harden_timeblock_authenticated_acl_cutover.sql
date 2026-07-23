-- Forward-only hardening for the authenticated timeblock ACL cutover.
-- The completion of this transaction, not the preceding expand migration, is
-- the strict boundary after which no in-flight browser DML may commit.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.plans, public.records IN ACCESS EXCLUSIVE MODE;

REVOKE ALL PRIVILEGES ON TABLE public.plans FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.records FROM PUBLIC, anon, authenticated;

-- Table-level REVOKE does not remove an independently granted column ACL.
-- Build the list from the current catalog so production-only columns cannot
-- preserve a direct write capability.
DO $$
DECLARE
  v_columns TEXT;
  v_table_name TEXT;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY['plans', 'records']
  LOOP
    SELECT pg_catalog.string_agg(pg_catalog.quote_ident(attribute.attname), ', ')
    INTO v_columns
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = v_table_name
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;

    IF v_columns IS NULL THEN
      RAISE EXCEPTION 'Timeblock table % has no columns', v_table_name
        USING ERRCODE = '42P01';
    END IF;

    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      v_columns,
      v_table_name
    );
  END LOOP;
END;
$$;

GRANT SELECT ON TABLE public.plans TO authenticated;
GRANT SELECT ON TABLE public.records TO authenticated;

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
      AND acl.grantee IN (0::OID, v_anon_oid, v_authenticated_oid)
  ) THEN
    RAISE EXCEPTION 'Public, anon, or authenticated timeblock column capability remains'
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
    )
    OR pg_catalog.has_function_privilege(
      'anon',
      'public.soft_delete_plan(uuid,uuid)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'anon',
      'public.soft_delete_record(uuid,uuid)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'anon',
      'public.confirm_day_plans_to_records(uuid,timestamptz,timestamptz,timestamptz)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'Public, anon, or authenticated legacy timeblock RPC capability remains'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMIT;
