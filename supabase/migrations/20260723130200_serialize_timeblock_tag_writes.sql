-- Multi-table tag operations lock tags before touching Plans / Records, while
-- ordinary timeblock updates can lock those relations in the opposite order.
-- Give these rare operations the same-user exclusive lock to remove that
-- deadlock cycle without serializing ordinary same-user writers.

ALTER FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID)
  SET SCHEMA private;
ALTER FUNCTION private.merge_tags_with_hierarchy(UUID, UUID, UUID)
  RENAME TO merge_tags_with_hierarchy_shared_v1;

ALTER FUNCTION public.delete_tags_with_timeblocks_command_v1(
  UUID, UUID[], TEXT, UUID
) SET SCHEMA private;
ALTER FUNCTION private.delete_tags_with_timeblocks_command_v1(
  UUID, UUID[], TEXT, UUID
) RENAME TO delete_tags_with_timeblocks_shared_v1;

REVOKE ALL ON FUNCTION private.merge_tags_with_hierarchy_shared_v1(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.delete_tags_with_timeblocks_shared_v1(
  UUID, UUID[], TEXT, UUID
) FROM PUBLIC, anon, authenticated, service_role;

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
  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);
  RETURN private.merge_tags_with_hierarchy_shared_v1(
    p_user_id,
    p_source_tag_id,
    p_target_tag_id
  );
END;
$$;

CREATE FUNCTION public.delete_tags_with_timeblocks_command_v1(
  p_user_id UUID,
  p_tag_ids UUID[],
  p_strategy TEXT,
  p_target_tag_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);
  RETURN private.delete_tags_with_timeblocks_shared_v1(
    p_user_id,
    p_tag_ids,
    p_strategy,
    p_target_tag_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_tags_with_timeblocks_command_v1(
  UUID, UUID[], TEXT, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_tags_with_timeblocks_command_v1(
  UUID, UUID[], TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.merge_tags_with_hierarchy(UUID, UUID, UUID) IS
  'Atomically merges two tags under an exclusive same-user timeblock lock; service role only.';
COMMENT ON FUNCTION public.delete_tags_with_timeblocks_command_v1(
  UUID, UUID[], TEXT, UUID
) IS 'Atomically applies a tag association strategy and deletes source tags under an exclusive same-user timeblock lock; service role only.';

