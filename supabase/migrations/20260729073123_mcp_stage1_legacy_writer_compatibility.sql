-- Candidate 1 keeps currently deployed service-role legacy writers inside
-- the same-user serialization boundary while newer app commands roll out.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Keep the old production bundle functional during the command cutover
-- without restoring authenticated table DML. These wrappers preserve the old
-- signatures while routing owner-scoped calls through the serialized command
-- implementations. Remove them only after every old app instance is drained.

CREATE OR REPLACE FUNCTION public.confirm_day_plans_to_records(
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
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch'
      USING ERRCODE = '42501';
  END IF;

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

CREATE OR REPLACE FUNCTION public.soft_delete_plan(p_plan_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  SELECT plan.updated_at
  INTO v_updated_at
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = p_user_id
    AND plan.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or already deleted'
      USING ERRCODE = 'DT001';
  END IF;

  PERFORM private.delete_plan_unserialized_v1(
    p_user_id,
    p_plan_id,
    v_updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_record(p_record_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  SELECT record.updated_at
  INTO v_updated_at
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found or already deleted'
      USING ERRCODE = 'DT001';
  END IF;

  PERFORM private.delete_record_unserialized_v1(
    p_user_id,
    p_record_id,
    v_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_day_plans_to_records(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_plan(UUID, UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_record(UUID, UUID)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.confirm_day_plans_to_records(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_plan(UUID, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_record(UUID, UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_day_plans_to_records(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ
) IS 'Temporary old-bundle compatibility wrapper over the serialized confirm-day implementation.';
COMMENT ON FUNCTION public.soft_delete_plan(UUID, UUID) IS
  'Temporary old-bundle compatibility wrapper over the serialized Plan delete implementation.';
COMMENT ON FUNCTION public.soft_delete_record(UUID, UUID) IS
  'Temporary old-bundle compatibility wrapper over the serialized Record delete implementation.';

-- Old production bundles still call the no-CAS restore RPCs through the service
-- role. Keep those temporary entrypoints inside the same user serialization
-- boundary until old instances are drained.

CREATE OR REPLACE FUNCTION public.restore_plan(p_plan_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  SELECT plan.updated_at
  INTO v_updated_at
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = p_user_id
    AND plan.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or not deleted'
      USING ERRCODE = 'DT001';
  END IF;

  PERFORM private.restore_plan_unserialized_v1(
    p_user_id,
    p_plan_id,
    v_updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_record(p_record_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  SELECT record.updated_at
  INTO v_updated_at
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found or not deleted'
      USING ERRCODE = 'DT001';
  END IF;

  PERFORM private.restore_record_unserialized_v1(
    p_user_id,
    p_record_id,
    v_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_plan(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_record(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.restore_plan(UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_record(UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.restore_plan(UUID, UUID) IS
  'Temporary old-bundle service-role compatibility wrapper over the serialized Plan restore implementation.';
COMMENT ON FUNCTION public.restore_record(UUID, UUID) IS
  'Temporary old-bundle service-role compatibility wrapper over the serialized Record restore implementation.';

COMMIT;
