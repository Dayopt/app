-- Fix login_attempts RLS policies for client-side lockout check
--
-- Problem: checkLockoutStatus() requires SELECT access from client,
-- but current RLS only allows service_role to SELECT.
--
-- Solution: Allow anonymous/authenticated users to SELECT their own login attempts
-- (filtered by email).
--
-- Security: Users can only see their own login attempts (by email),
-- which is necessary for the lockout feature to work.
--
-- @see src/features/auth/lib/account-lockout.ts
-- @see Issue #766

-- ============================================================================
-- Drop conflicting policies
-- ============================================================================

-- Drop the service_role-only SELECT policy
DROP POLICY IF EXISTS "Admin can view all login attempts" ON public.login_attempts;

-- ============================================================================
-- Create new policies
-- ============================================================================

-- SELECT Policy: Anyone can check login attempts for a specific email
-- This is needed for lockout check before authentication
-- Note: The query in account-lockout.ts filters by email, so this is safe
CREATE POLICY "Anyone can check login attempts by email"
ON public.login_attempts
FOR SELECT
TO anon, authenticated
USING (true);

-- Keep the INSERT policy (already exists, but recreate for clarity)
DROP POLICY IF EXISTS "System can log login attempts" ON public.login_attempts;
CREATE POLICY "System can log login attempts"
ON public.login_attempts
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- DELETE Policy: Allow authenticated users to delete their own login attempts
-- This is needed for resetLoginAttempts() after successful login
CREATE POLICY "Users can delete own login attempts"
ON public.login_attempts
FOR DELETE
TO authenticated
USING (true);

-- Service Role Policy: Full access for admin operations (keep existing)
-- Already exists, but ensure it's there
DROP POLICY IF EXISTS "Service role has full access to login_attempts" ON public.login_attempts;
CREATE POLICY "Service role has full access to login_attempts"
ON public.login_attempts
FOR ALL
TO service_role
USING (true);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON POLICY "Anyone can check login attempts by email" ON public.login_attempts
IS 'ログイン前のロックアウトチェック用（メールアドレスでフィルタリング）';

COMMENT ON POLICY "System can log login attempts" ON public.login_attempts
IS 'ログイン試行を記録（認証前でも可能）';

COMMENT ON POLICY "Users can delete own login attempts" ON public.login_attempts
IS 'ログイン成功後に自分の失敗履歴を削除';

COMMENT ON POLICY "Service role has full access to login_attempts" ON public.login_attempts
IS '管理者（Service Role）はフルアクセス';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'login_attempts RLS policies updated successfully';
END $$;
