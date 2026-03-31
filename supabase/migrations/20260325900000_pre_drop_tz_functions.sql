-- =============================================================================
-- 戻り値型が変わる関数を事前に DROP
--
-- 20260326000000_fix_stats_timezone_awareness.sql で戻り値型・パラメータが変わる
-- 関数群を先に DROP。PostgreSQL は CREATE OR REPLACE で戻り値型変更不可のため。
-- シグネチャは 20260317022728_fix_security_definer_idor.sql 時点のもの。
-- =============================================================================

-- get_active_dates: (UUID, TIMESTAMPTZ) → (UUID, DATE, DATE)
DROP FUNCTION IF EXISTS public.get_active_dates(UUID, TIMESTAMPTZ);

-- get_daily_hours: (UUID, TIMESTAMPTZ, TIMESTAMPTZ) → (UUID, INT)
DROP FUNCTION IF EXISTS public.get_daily_hours(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

-- get_hourly_distribution: (UUID, TIMESTAMPTZ, TIMESTAMPTZ) 戻り値変更
DROP FUNCTION IF EXISTS public.get_hourly_distribution(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

-- get_dow_distribution: (UUID, TIMESTAMPTZ, TIMESTAMPTZ) 戻り値変更
DROP FUNCTION IF EXISTS public.get_dow_distribution(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

-- get_monthly_hours: (UUID, TIMESTAMPTZ) → (UUID, INT)
DROP FUNCTION IF EXISTS public.get_monthly_hours(UUID, TIMESTAMPTZ);

-- get_fulfillment_trend: (UUID, DATE, DATE) 戻り値変更
DROP FUNCTION IF EXISTS public.get_fulfillment_trend(UUID, DATE, DATE);

-- get_energy_map: (UUID, DATE, DATE) → (UUID, TIMESTAMPTZ, TIMESTAMPTZ) 戻り値変更
DROP FUNCTION IF EXISTS public.get_energy_map(UUID, DATE, DATE);

-- get_weekly_focus_score: (UUID, INT) 戻り値変更
DROP FUNCTION IF EXISTS public.get_weekly_focus_score(UUID, INT);

-- get_plan_summary: (UUID) 戻り値変更
DROP FUNCTION IF EXISTS public.get_plan_summary(UUID);
