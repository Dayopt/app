-- Keep automatic plan recordings idempotent under concurrent requests while
-- allowing a plan to have multiple manually entered actual-log segments.
CREATE UNIQUE INDEX logs_one_active_from_plan_per_plan_idx
  ON public.logs (plan_id)
  WHERE deleted_at IS NULL
    AND plan_id IS NOT NULL
    AND source = 'from_plan';
