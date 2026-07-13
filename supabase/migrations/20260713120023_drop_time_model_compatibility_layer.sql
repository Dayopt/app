-- Step 9b の rolling deploy 用に残した Log 名 compatibility layer を削除する。
-- exact signature と RESTRICT（既定）で、想定外の overload / dependent object を巻き込まない。
DROP FUNCTION public.confirm_day_plans_to_logs(
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TIMESTAMPTZ
);
DROP FUNCTION public.restore_log(UUID, UUID);
DROP FUNCTION public.soft_delete_log(UUID, UUID);

DROP VIEW public.logs;
