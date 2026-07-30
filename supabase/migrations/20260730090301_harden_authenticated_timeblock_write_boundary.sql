-- Candidate 6 harden step for the authenticated Plan / Record ACL cutover.
--
-- The commit of *this* transaction, not the preceding expand migration, is the
-- strict boundary after which no in-flight browser DML may commit. The
-- ACCESS EXCLUSIVE lock below waits out sessions that already hold a row lock
-- under the old grants, so a transaction that started before the expand
-- migration cannot slip a write past the revoke.
--
-- Still deliberately kept: authenticated EXECUTE on soft_delete_plan /
-- soft_delete_record / confirm_day_plans_to_records. Those SECURITY DEFINER
-- wrappers verify auth.uid() ownership and are the not-yet-drained old bundle's
-- only remaining write path. The assertions below prove they survived.
--
-- Also closed here: the baseline default ACL left authenticated with TRUNCATE
-- (and MAINTAIN on PostgreSQL 17+), both of which bypass RLS.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.plans, public.records IN ACCESS EXCLUSIVE MODE;

REVOKE ALL PRIVILEGES ON TABLE public.plans FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.records FROM PUBLIC, anon, authenticated;

-- Table-level REVOKE does not remove an independently granted column ACL.
-- Build the column list from the current catalog so production-only columns
-- cannot preserve a direct write capability. Production currently holds zero
-- column ACLs on these tables; this keeps that true for columns added later.
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

-- Explicit ACL audit. Complements the effective-privilege view below, which
-- also catches capabilities inherited through another role.
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

  IF pg_catalog.has_function_privilege(
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
    RAISE EXCEPTION 'Anon legacy timeblock RPC capability remains'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Fail closed when anon or authenticated inherits a Plan / Record write
-- capability through another role. The ACL assertions above only inspect
-- explicit entries; this view is the canonical effective-privilege audit and is
-- also read by scripts/generate-rls-snapshot.ts.
CREATE VIEW private.timeblock_effective_write_privileges_v1
WITH (security_invoker = true)
AS
WITH inspected_roles(role_name) AS (
  VALUES ('anon'::NAME), ('authenticated'::NAME)
),
inspected_relations(relation_oid, object_name) AS (
  SELECT
    relation.oid,
    namespace.nspname || '.' || relation.relname
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN ('plans', 'records')
    AND relation.relkind IN ('r', 'p')
),
table_privileges(privilege_type) AS (
  SELECT pg_catalog.unnest(
    CASE
      WHEN pg_catalog.current_setting('server_version_num')::INTEGER >= 170000
        THEN ARRAY[
          'INSERT',
          'UPDATE',
          'DELETE',
          'TRUNCATE',
          'REFERENCES',
          'TRIGGER',
          'MAINTAIN'
        ]::TEXT[]
      ELSE ARRAY[
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      ]::TEXT[]
    END
  )
),
column_privileges(privilege_type) AS (
  SELECT pg_catalog.unnest(ARRAY['INSERT', 'UPDATE', 'REFERENCES']::TEXT[])
),
inspected_columns(relation_oid, object_name, attribute_number) AS (
  SELECT
    relation.oid,
    namespace.nspname || '.' || relation.relname || '.' || attribute.attname,
    attribute.attnum
  FROM pg_catalog.pg_attribute AS attribute
  JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN ('plans', 'records')
    AND relation.relkind IN ('r', 'p')
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
)
SELECT
  'table'::TEXT AS object_type,
  inspected_roles.role_name::TEXT AS grantee,
  inspected_relations.object_name,
  table_privileges.privilege_type
FROM inspected_roles
CROSS JOIN inspected_relations
CROSS JOIN table_privileges
WHERE pg_catalog.has_table_privilege(
  inspected_roles.role_name,
  inspected_relations.relation_oid,
  table_privileges.privilege_type
)
UNION ALL
SELECT
  'column'::TEXT AS object_type,
  inspected_roles.role_name::TEXT AS grantee,
  inspected_columns.object_name,
  column_privileges.privilege_type
FROM inspected_roles
CROSS JOIN inspected_columns
CROSS JOIN column_privileges
WHERE pg_catalog.has_column_privilege(
  inspected_roles.role_name,
  inspected_columns.relation_oid,
  inspected_columns.attribute_number,
  column_privileges.privilege_type
);

COMMENT ON VIEW private.timeblock_effective_write_privileges_v1 IS
  'One row per effective anon / authenticated Plan or Record write capability. Empty is the only correct state after the Candidate 6 cutover.';

REVOKE ALL ON TABLE private.timeblock_effective_write_privileges_v1
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.assert_timeblock_effective_write_boundary_v1()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_violation RECORD;
BEGIN
  SELECT violation.*
  INTO v_violation
  FROM private.timeblock_effective_write_privileges_v1 AS violation
  ORDER BY
    violation.grantee,
    violation.object_type,
    violation.object_name,
    violation.privilege_type
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Effective timeblock write privilege remains'
      USING
        ERRCODE = '42501',
        DETAIL = pg_catalog.format(
          '%s has effective %s on %s %s',
          v_violation.grantee,
          v_violation.privilege_type,
          v_violation.object_type,
          v_violation.object_name
        );
  END IF;
END;
$$;

COMMENT ON FUNCTION private.assert_timeblock_effective_write_boundary_v1() IS
  'Raises 42501 when anon or authenticated still holds an effective Plan / Record write capability.';

REVOKE ALL ON FUNCTION private.assert_timeblock_effective_write_boundary_v1()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT private.assert_timeblock_effective_write_boundary_v1();

COMMIT;
