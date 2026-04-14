-- get_weekly_reflection_data が 20260414140200 で DROP されなかったため再実行
-- 引数型のバリエーションを網羅して確実に削除
DROP FUNCTION IF EXISTS public.get_weekly_reflection_data(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_weekly_reflection_data(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_weekly_reflection_data(UUID, DATE);
