-- Fail closed when anon or authenticated inherits a Plan / Record write
-- capability through another role. The preceding cutover migrations inspect
-- explicit ACL entries; this view is the canonical effective-privilege audit.

BEGIN;

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

REVOKE ALL ON FUNCTION private.assert_timeblock_effective_write_boundary_v1()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT private.assert_timeblock_effective_write_boundary_v1();

COMMIT;
