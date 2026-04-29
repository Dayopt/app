-- ============================================================
-- Fix: tags / user_settings UPDATE ポリシーに WITH CHECK を追加
--
-- 問題:
--   既存の UPDATE policy は USING のみで WITH CHECK が無いため、
--   自分の行を SELECT した上で user_id を他人の UUID に書き換える操作が
--   RLS を素通りする。tRPC 経由では ctx.userId で WHERE 絞りされて防がれるが、
--   Supabase JS client から直接 UPDATE すると通る。
--
-- 修正方針:
--   entries 側で 20260323000000 で適用済みの WITH CHECK パターンを
--   tags / user_settings に揃える。
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. tags
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own tags" ON public.tags;
CREATE POLICY "Users can update own tags" ON public.tags
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ────────────────────────────────────────────────────────────
-- 2. user_settings
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
