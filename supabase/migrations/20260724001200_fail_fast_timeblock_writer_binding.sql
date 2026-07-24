-- Bind supported writer identity before any user-specific lock. This makes an
-- invalid A -> B transaction fail before it can participate in an A/B advisory
-- lock cycle with another invalid B -> A transaction.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION private.lock_timeblock_user_write_shared_v1(p_user_id UUID)
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

  PERFORM private.lock_timeblock_global_supported_write_v1();
  PERFORM private.bind_timeblock_supported_writer_v1(p_user_id);

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timeblock user not found'
      USING ERRCODE = 'DT001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      'dayopt:timeblock-user-write:' || p_user_id::TEXT,
      6182714039157042
    )
  );

  INSERT INTO private.timeblock_user_revisions (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM revision.user_id
  FROM private.timeblock_user_revisions AS revision
  WHERE revision.user_id = p_user_id
  FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION private.lock_timeblock_user_write_exclusive_v1(p_user_id UUID)
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

  PERFORM private.lock_timeblock_global_supported_write_v1();
  PERFORM private.bind_timeblock_supported_writer_v1(p_user_id);

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timeblock user not found'
      USING ERRCODE = 'DT001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dayopt:timeblock-user-write:' || p_user_id::TEXT,
      6182714039157042
    )
  );

  INSERT INTO private.timeblock_user_revisions (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM revision.user_id
  FROM private.timeblock_user_revisions AS revision
  WHERE revision.user_id = p_user_id
  FOR UPDATE;
END;
$$;

REVOKE ALL ON FUNCTION private.lock_timeblock_user_write_shared_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.lock_timeblock_user_write_exclusive_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.lock_timeblock_user_write_shared_v1(UUID) IS
  'Binds one supported user after the global boundary, then takes parent, user, and revision locks.';
COMMENT ON FUNCTION private.lock_timeblock_user_write_exclusive_v1(UUID) IS
  'Binds one supported user after the global boundary, then takes exclusive user and revision locks.';

COMMIT;
