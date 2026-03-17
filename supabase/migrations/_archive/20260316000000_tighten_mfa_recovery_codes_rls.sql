-- mfa_recovery_codes の RLS ポリシーを強化
-- 既存の "Service role can manage recovery codes" は USING(true) で全ユーザーから
-- INSERT/DELETE 可能だったため、自分のコードのみ操作可能に制限する

-- 既存の過度に寛容なポリシーを削除
DROP POLICY IF EXISTS "Service role can manage recovery codes" ON public.mfa_recovery_codes;

-- ユーザーは自分のリカバリーコードのみ挿入可能
CREATE POLICY "Users can insert own recovery codes"
    ON public.mfa_recovery_codes
    FOR INSERT
    WITH CHECK ((select auth.uid()) = user_id);

-- ユーザーは自分のリカバリーコードのみ削除可能
CREATE POLICY "Users can delete own recovery codes"
    ON public.mfa_recovery_codes
    FOR DELETE
    USING ((select auth.uid()) = user_id);

-- SELECT ポリシーも最適化（既存の auth.uid() を (select auth.uid()) に統一）
DROP POLICY IF EXISTS "Users can view own recovery codes" ON public.mfa_recovery_codes;
CREATE POLICY "Users can view own recovery codes"
    ON public.mfa_recovery_codes
    FOR SELECT
    USING ((select auth.uid()) = user_id);

-- UPDATE は use_recovery_code() RPC（SECURITY DEFINER）経由でのみ行うため、
-- クライアントからの直接 UPDATE は不許可（ポリシーなし = 拒否）
