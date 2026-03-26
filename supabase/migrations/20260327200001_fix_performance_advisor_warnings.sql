-- ============================================================
-- Fix: Performance Advisor 警告の修正
--
-- 1. レガシーテーブル削除（tag_relations, tag_operation_logs）
-- 2. palette_items RLSポリシー最適化（auth.uid() → (SELECT auth.uid())）
-- ============================================================

-- 1. レガシーテーブル削除
--    コード内に参照なし。DB上に残存しているだけ
DROP TABLE IF EXISTS public.tag_operation_logs;
DROP TABLE IF EXISTS public.tag_relations;

-- 2. palette_items: auth.uid() → (SELECT auth.uid()) でステートメントレベルキャッシュ有効化
DROP POLICY IF EXISTS "Users can view own palette items" ON public.palette_items;
CREATE POLICY "Users can view own palette items" ON public.palette_items
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own palette items" ON public.palette_items;
CREATE POLICY "Users can create own palette items" ON public.palette_items
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own palette items" ON public.palette_items;
CREATE POLICY "Users can update own palette items" ON public.palette_items
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own palette items" ON public.palette_items;
CREATE POLICY "Users can delete own palette items" ON public.palette_items
  FOR DELETE USING ((SELECT auth.uid()) = user_id);
