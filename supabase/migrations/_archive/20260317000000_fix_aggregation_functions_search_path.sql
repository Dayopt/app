-- SECURITY DEFINER関数にsearch_pathを固定
-- search_path未固定のSECURITY DEFINER関数はスキーマハイジャック攻撃のリスクがある
-- 対象: 20260301000002_aggregation_and_gamification_functions.sql の全5関数

ALTER FUNCTION public.get_weekly_reflection_data(uuid, date)
  SET search_path = public;

ALTER FUNCTION public.get_fulfillment_trend(uuid, date, date)
  SET search_path = public;

ALTER FUNCTION public.get_energy_map(uuid, date, date)
  SET search_path = public;

ALTER FUNCTION public.get_timeboxing_adherence(uuid, date, date)
  SET search_path = public;

ALTER FUNCTION public.get_weekly_focus_score(uuid, int)
  SET search_path = public;
