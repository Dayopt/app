-- Cache the transaction-local soft-delete marker once per statement instead of
-- evaluating current_setting() for every candidate row. The ownership check,
-- missing_ok behavior, and deleted-row visibility contract remain unchanged.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER POLICY "Users can view own plans" ON public.plans
  USING (
    (SELECT auth.uid()) = user_id
    AND (
      deleted_at IS NULL
      OR (SELECT current_setting('dayopt.soft_delete_user_id', true)) = user_id::TEXT
    )
  );

ALTER POLICY "Users can view own records" ON public.records
  USING (
    (SELECT auth.uid()) = user_id
    AND (
      deleted_at IS NULL
      OR (SELECT current_setting('dayopt.soft_delete_user_id', true)) = user_id::TEXT
    )
  );

COMMIT;
