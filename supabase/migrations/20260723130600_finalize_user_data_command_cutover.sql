-- Supabase and Vercel deploy independently after a main merge. Expose final
-- command names only after every serialization migration is installed, so a
-- new application instance fails closed while the database is on a prefix.

CREATE FUNCTION public.delete_user_timeblocks_command_v2(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  RETURN public.delete_user_timeblocks_command_v1(p_user_id);
END;
$$;

CREATE FUNCTION public.delete_all_user_data_command_v2(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  RETURN public.delete_all_user_data_command_v1(p_user_id);
END;
$$;

CREATE FUNCTION public.delete_tags_with_timeblocks_command_v3(
  p_user_id UUID,
  p_tag_ids UUID[],
  p_strategy TEXT,
  p_target_tag_id UUID,
  p_promote_children BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  RETURN public.delete_tags_with_timeblocks_command_v2(
    p_user_id,
    p_tag_ids,
    p_strategy,
    p_target_tag_id,
    p_promote_children
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_timeblocks_command_v2(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_all_user_data_command_v2(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_tags_with_timeblocks_command_v3(
  UUID, UUID[], TEXT, UUID, BOOLEAN
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_user_timeblocks_command_v2(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_all_user_data_command_v2(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_tags_with_timeblocks_command_v3(
  UUID, UUID[], TEXT, UUID, BOOLEAN
) TO service_role;

-- Do not let the application call a command name that existed before the
-- final serialization boundary. The final wrappers retain owner access to the
-- underlying implementations.
REVOKE EXECUTE ON FUNCTION public.delete_user_timeblocks_command_v1(UUID)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.delete_all_user_data_command_v1(UUID)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.delete_tags_with_timeblocks_command_v2(
  UUID, UUID[], TEXT, UUID, BOOLEAN
) FROM service_role;

-- Compatibility phase: origin/main still calls these routines. Keep the
-- production behavior that existed before the command cutover until every old
-- application instance is drained. A later cleanup migration revokes them.
GRANT EXECUTE ON FUNCTION public.confirm_day_plans_to_records(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_plan(UUID, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_record(UUID, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_plan(UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_record(UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.delete_user_timeblocks_command_v2(UUID) IS
  'Final rollout-safe entrypoint for atomic Plan and Record purge; service role only.';
COMMENT ON FUNCTION public.delete_all_user_data_command_v2(UUID) IS
  'Final rollout-safe entrypoint for atomic user-data purge; service role only.';
COMMENT ON FUNCTION public.delete_tags_with_timeblocks_command_v3(
  UUID, UUID[], TEXT, UUID, BOOLEAN
) IS 'Final rollout-safe entrypoint for atomic tag and timeblock deletion; service role only.';
