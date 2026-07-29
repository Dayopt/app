-- Candidate 1 forward-only fold of the proven same-user writer boundary.
-- Stage 3 purge entrypoints are intentionally excluded.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Serialize destructive user-data purges against every application-owned
-- Plan / Record writer without making ordinary writers block one another.
-- Shared transaction advisory locks are taken before domain row locks; purge
-- commands introduced by the following migration take the matching exclusive
-- lock.

-- =============================================================================
-- 1. Private lock and request guards
-- =============================================================================

CREATE FUNCTION private.assert_timeblock_service_role_request_v1()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied: service role required'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_timeblock_service_role_request_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.lock_timeblock_user_write_shared_v1(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Timeblock user lock requires a user id'
      USING ERRCODE = '22004';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      'dayopt:timeblock-user-write:' || p_user_id::TEXT,
      6182714039157042
    )
  );
END;
$$;

CREATE FUNCTION private.lock_timeblock_user_write_exclusive_v1(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Timeblock user lock requires a user id'
      USING ERRCODE = '22004';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dayopt:timeblock-user-write:' || p_user_id::TEXT,
      6182714039157042
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.lock_timeblock_user_write_shared_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.lock_timeblock_user_write_exclusive_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

-- =============================================================================
-- 3. Move existing implementations behind service-role-guarded wrappers
-- =============================================================================

ALTER FUNCTION public.create_plan_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) SET SCHEMA private;
ALTER FUNCTION private.create_plan_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) RENAME TO create_plan_unserialized_v1;

ALTER FUNCTION public.update_plan_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) SET SCHEMA private;
ALTER FUNCTION private.update_plan_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) RENAME TO update_plan_unserialized_v1;

ALTER FUNCTION public.delete_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  SET SCHEMA private;
ALTER FUNCTION private.delete_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  RENAME TO delete_plan_unserialized_v1;

ALTER FUNCTION public.restore_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  SET SCHEMA private;
ALTER FUNCTION private.restore_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  RENAME TO restore_plan_unserialized_v1;

ALTER FUNCTION public.set_plan_skipped_command_v1(UUID, UUID, TIMESTAMPTZ, BOOLEAN)
  SET SCHEMA private;
ALTER FUNCTION private.set_plan_skipped_command_v1(UUID, UUID, TIMESTAMPTZ, BOOLEAN)
  RENAME TO set_plan_skipped_unserialized_v1;

ALTER FUNCTION public.create_record_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) SET SCHEMA private;
ALTER FUNCTION private.create_record_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) RENAME TO create_record_unserialized_v1;

ALTER FUNCTION public.update_record_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) SET SCHEMA private;
ALTER FUNCTION private.update_record_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) RENAME TO update_record_unserialized_v1;

ALTER FUNCTION public.delete_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  SET SCHEMA private;
ALTER FUNCTION private.delete_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  RENAME TO delete_record_unserialized_v1;

ALTER FUNCTION public.restore_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  SET SCHEMA private;
ALTER FUNCTION private.restore_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  RENAME TO restore_record_unserialized_v1;

ALTER FUNCTION public.record_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  SET SCHEMA private;
ALTER FUNCTION private.record_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  RENAME TO record_plan_unserialized_v1;

ALTER FUNCTION public.confirm_day_plans_command_v1(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) SET SCHEMA private;
ALTER FUNCTION private.confirm_day_plans_command_v1(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) RENAME TO confirm_day_plans_unserialized_v1;

ALTER FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID)
  SET SCHEMA private;
ALTER FUNCTION private.merge_tags_with_hierarchy(UUID, UUID, UUID)
  RENAME TO merge_tags_with_hierarchy_unserialized_v1;

REVOKE ALL ON FUNCTION private.create_plan_unserialized_v1(
  UUID, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_plan_unserialized_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.delete_plan_unserialized_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.restore_plan_unserialized_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.set_plan_skipped_unserialized_v1(
  UUID, UUID, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.create_record_unserialized_v1(
  UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_record_unserialized_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.delete_record_unserialized_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.restore_record_unserialized_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.record_plan_unserialized_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.confirm_day_plans_unserialized_v1(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.merge_tags_with_hierarchy_unserialized_v1(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

-- =============================================================================
-- 4. Public typed wrappers
-- =============================================================================

CREATE FUNCTION public.create_plan_command_v1(
  p_user_id UUID,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_external_calendar_event_id UUID,
  p_source TEXT,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.create_plan_unserialized_v1(
    p_user_id,
    p_title,
    p_note,
    p_tag_id,
    p_external_calendar_event_id,
    p_source,
    p_start_at,
    p_end_at
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.update_plan_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_external_calendar_event_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.update_plan_unserialized_v1(
    p_user_id,
    p_plan_id,
    p_expected_updated_at,
    p_title,
    p_note,
    p_tag_id,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.delete_plan_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.delete_plan_unserialized_v1(
    p_user_id,
    p_plan_id,
    p_expected_updated_at
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.restore_plan_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.restore_plan_unserialized_v1(
    p_user_id,
    p_plan_id,
    p_expected_updated_at
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.set_plan_skipped_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_skipped BOOLEAN
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.set_plan_skipped_unserialized_v1(
    p_user_id,
    p_plan_id,
    p_expected_updated_at,
    p_skipped
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.create_record_command_v1(
  p_user_id UUID,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_plan_id UUID,
  p_external_calendar_event_id UUID,
  p_source TEXT,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.create_record_unserialized_v1(
    p_user_id,
    p_title,
    p_note,
    p_tag_id,
    p_plan_id,
    p_external_calendar_event_id,
    p_source,
    p_start_at,
    p_end_at
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.update_record_command_v1(
  p_user_id UUID,
  p_record_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_title TEXT,
  p_note TEXT,
  p_tag_id UUID,
  p_plan_id UUID,
  p_external_calendar_event_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.update_record_unserialized_v1(
    p_user_id,
    p_record_id,
    p_expected_updated_at,
    p_title,
    p_note,
    p_tag_id,
    p_plan_id,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.delete_record_command_v1(
  p_user_id UUID,
  p_record_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.delete_record_unserialized_v1(
    p_user_id,
    p_record_id,
    p_expected_updated_at
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.restore_record_command_v1(
  p_user_id UUID,
  p_record_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.restore_record_unserialized_v1(
    p_user_id,
    p_record_id,
    p_expected_updated_at
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.record_plan_command_v1(
  p_user_id UUID,
  p_plan_id UUID,
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.record_plan_unserialized_v1(
    p_user_id,
    p_plan_id,
    p_expected_updated_at
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.confirm_day_plans_command_v1(
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_confirmed_at TIMESTAMPTZ DEFAULT pg_catalog.now()
)
RETURNS SETOF public.records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.confirm_day_plans_unserialized_v1(
    p_user_id,
    p_start_at,
    p_end_at,
    p_confirmed_at
  ) AS implementation;
END;
$$;

CREATE FUNCTION public.merge_tags_with_hierarchy(
  p_user_id UUID,
  p_source_tag_id UUID,
  p_target_tag_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN private.merge_tags_with_hierarchy_unserialized_v1(
    p_user_id,
    p_source_tag_id,
    p_target_tag_id
  );
END;
$$;

-- =============================================================================
-- 5. ACLs, bounded MCP waits, and legacy writer retirement
-- =============================================================================

REVOKE ALL ON FUNCTION public.create_plan_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_plan_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_plan_skipped_command_v1(
  UUID, UUID, TIMESTAMPTZ, BOOLEAN
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_record_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_record_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_day_plans_command_v1(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_plan_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_plan_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_plan_skipped_command_v1(
  UUID, UUID, TIMESTAMPTZ, BOOLEAN
) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_record_command_v1(
  UUID, TEXT, TEXT, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_record_command_v1(
  UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_record_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_plan_command_v1(UUID, UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_day_plans_command_v1(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID)
  TO service_role;

-- No deployed caller uses these pre-command recovery functions. Keeping them
-- executable would create an unlocked production-capable write path.
REVOKE EXECUTE ON FUNCTION public.soft_delete_plan(UUID, UUID) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.soft_delete_record(UUID, UUID) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.confirm_day_plans_to_records(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM service_role;

ALTER FUNCTION public.apply_mcp_plan_create_v1(
  UUID, UUID, UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) SET lock_timeout = '5s';
ALTER FUNCTION public.apply_mcp_plan_create_v1(
  UUID, UUID, UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) SET statement_timeout = '30s';
ALTER FUNCTION public.apply_mcp_plan_update_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, UUID,
  BOOLEAN, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) SET lock_timeout = '5s';
ALTER FUNCTION public.apply_mcp_plan_update_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, UUID,
  BOOLEAN, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) SET statement_timeout = '30s';
ALTER FUNCTION public.apply_mcp_plan_delete_v1(UUID, UUID, UUID, UUID, TIMESTAMPTZ)
  SET lock_timeout = '5s';
ALTER FUNCTION public.apply_mcp_plan_delete_v1(UUID, UUID, UUID, UUID, TIMESTAMPTZ)
  SET statement_timeout = '30s';
ALTER FUNCTION public.apply_mcp_plan_restore_v1(UUID, UUID, UUID, UUID, TIMESTAMPTZ)
  SET lock_timeout = '5s';
ALTER FUNCTION public.apply_mcp_plan_restore_v1(UUID, UUID, UUID, UUID, TIMESTAMPTZ)
  SET statement_timeout = '30s';

ALTER FUNCTION public.apply_mcp_record_create_v1(
  UUID, UUID, UUID, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) SET lock_timeout = '5s';
ALTER FUNCTION public.apply_mcp_record_create_v1(
  UUID, UUID, UUID, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) SET statement_timeout = '30s';
ALTER FUNCTION public.apply_mcp_record_update_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, UUID,
  BOOLEAN, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) SET lock_timeout = '5s';
ALTER FUNCTION public.apply_mcp_record_update_v1(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ,
  BOOLEAN, TEXT, BOOLEAN, TEXT, BOOLEAN, UUID,
  BOOLEAN, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) SET statement_timeout = '30s';
ALTER FUNCTION public.apply_mcp_record_delete_v1(UUID, UUID, UUID, UUID, TIMESTAMPTZ)
  SET lock_timeout = '5s';
ALTER FUNCTION public.apply_mcp_record_delete_v1(UUID, UUID, UUID, UUID, TIMESTAMPTZ)
  SET statement_timeout = '30s';
ALTER FUNCTION public.apply_mcp_record_restore_v1(UUID, UUID, UUID, UUID, TIMESTAMPTZ)
  SET lock_timeout = '5s';
ALTER FUNCTION public.apply_mcp_record_restore_v1(UUID, UUID, UUID, UUID, TIMESTAMPTZ)
  SET statement_timeout = '30s';

COMMENT ON FUNCTION private.lock_timeblock_user_write_shared_v1(UUID) IS
  'Owner-private same-user shared transaction lock for application-owned Plan / Record writers.';
COMMENT ON FUNCTION private.lock_timeblock_user_write_exclusive_v1(UUID) IS
  'Owner-private same-user exclusive transaction lock for atomic user-data purges.';


COMMIT;
