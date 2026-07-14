-- PostgreSQL also applies SELECT policy visibility while evaluating UPDATE.
-- Permit the owner to see the just-deleted row only inside the soft-delete RPC
-- transaction. A normal authenticated SELECT has no transaction-local marker
-- and continues to hide every deleted row.

ALTER POLICY "Users can view own plans" ON public.plans
  USING (
    (SELECT auth.uid()) = user_id
    AND (
      deleted_at IS NULL
      OR current_setting('dayopt.soft_delete_user_id', true) = user_id::TEXT
    )
  );

ALTER POLICY "Users can view own records" ON public.records
  USING (
    (SELECT auth.uid()) = user_id
    AND (
      deleted_at IS NULL
      OR current_setting('dayopt.soft_delete_user_id', true) = user_id::TEXT
    )
  );

CREATE OR REPLACE FUNCTION public.soft_delete_plan(p_plan_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  PERFORM pg_catalog.set_config('dayopt.soft_delete_user_id', p_user_id::TEXT, true);

  UPDATE public.plans
  SET deleted_at = pg_catalog.now()
  WHERE id = p_plan_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or already deleted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_record(p_record_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  PERFORM pg_catalog.set_config('dayopt.soft_delete_user_id', p_user_id::TEXT, true);

  UPDATE public.records
  SET deleted_at = pg_catalog.now()
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
    AND source IS DISTINCT FROM 'auto_migrated';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found, already deleted, or protected';
  END IF;
END;
$$;
