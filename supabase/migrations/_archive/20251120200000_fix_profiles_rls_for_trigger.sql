-- ========================================
-- fix_profiles_rls_for_trigger.sql
-- 作成日: 2025-11-20
-- 目的: profiles のRLSポリシーを修正し、SECURITY DEFINERトリガーからのINSERTを許可
-- ========================================

-- 既存のINSERTポリシーを削除
DROP POLICY IF EXISTS "Users can insert own profile on signup" ON public.profiles;

-- 新しいINSERTポリシーを作成（SECURITY DEFINER 関数からのINSERTを許可）
-- TO public に変更し、WITH CHECK (true) で全てのINSERTを許可
-- これにより、handle_new_user() トリガーがprofilesにレコードを挿入できるようになります
CREATE POLICY "Users can insert own profile on signup"
ON public.profiles
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (true);

-- 注意: この変更により、SECURITY DEFINER 関数（handle_new_user）が
-- 認証状態に関係なく profiles テーブルに挿入できるようになります。
-- セキュリティは handle_new_user() 関数の実装に依存します。
