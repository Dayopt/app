-- Keep the Customer completion command lint-clean while preserving the exact
-- row lock and replay contract introduced by the provisioning fence.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.complete_billing_customer_provisioning_v1(
  p_operation_id UUID,
  p_provider_customer_id TEXT,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_current_customer_id TEXT;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_operation_id IS NULL
    OR p_user_id IS NULL
    OR p_provider_customer_id IS NULL
    OR p_provider_customer_id !~ '^cus_[A-Za-z0-9_]+$'
    OR pg_catalog.char_length(p_provider_customer_id) > 255 THEN
    RAISE EXCEPTION 'Invalid billing Customer provisioning completion'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing Customer provisioning user is unavailable'
      USING ERRCODE = 'AD011';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  PERFORM private.assert_account_not_closing_v1(p_user_id);

  PERFORM 1
  FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id
    AND attempt.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT profile.stripe_customer_id
    INTO v_current_customer_id
    FROM public.profiles AS profile
    WHERE profile.id = p_user_id
    FOR UPDATE;

    IF v_current_customer_id
      IS DISTINCT FROM p_provider_customer_id THEN
      RAISE EXCEPTION 'Billing Customer provisioning receipt is unavailable'
        USING ERRCODE = 'AD012';
    END IF;

    RETURN v_current_customer_id;
  END IF;

  SELECT profile.stripe_customer_id
  INTO v_current_customer_id
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR (
      v_current_customer_id IS NOT NULL
      AND v_current_customer_id
        IS DISTINCT FROM p_provider_customer_id
    ) THEN
    RAISE EXCEPTION 'Billing Customer binding changed'
      USING ERRCODE = 'AD014';
  END IF;

  UPDATE public.profiles AS profile
  SET stripe_customer_id = p_provider_customer_id
  WHERE profile.id = p_user_id
    AND profile.stripe_customer_id IS NULL;

  DELETE FROM private.billing_customer_provisioning_attempts AS attempt
  WHERE attempt.operation_id = p_operation_id;

  RETURN p_provider_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_billing_customer_provisioning_v1(
  UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_billing_customer_provisioning_v1(
  UUID, TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.complete_billing_customer_provisioning_v1(
  UUID, TEXT, UUID
) IS
  'Binds one recovered or created Stripe Customer to the profile and removes the temporary provisioning fence.';

COMMIT;
