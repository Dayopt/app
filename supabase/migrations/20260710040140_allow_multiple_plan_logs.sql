-- A plan may have multiple actual log segments. The record/confirm procedures
-- remain responsible for avoiding duplicate full-range from_plan logs.

DROP INDEX IF EXISTS public.logs_one_active_per_plan_idx;
