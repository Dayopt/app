-- ============================================================================
-- RLS Policies Complete Implementation
-- ============================================================================
-- Epic: #611 会員データセキュリティ整備（RLS完全実装）
--
-- このマイグレーションは以下を実装します：
-- 1. profiles テーブルのRLSポリシー（#612）
-- 2. login_attempts テーブルのRLSポリシー（#613）
--
-- 比喩: 会員Aが会員Bの情報を見られないようにする
-- ============================================================================

-- ============================================================================
-- Part 1: profiles テーブルのRLSポリシー（#612）
-- ============================================================================

-- Performance: Create index for RLS policy columns (99.94% improvement per Supabase docs)
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);

-- Drop existing policies if they exist (from remote_schema.sql)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;

-- SELECT Policy: Users can view own profile
-- Note: 本番環境には "Public profiles are viewable by everyone" があったが、
--       セキュリティ強化のため自分のプロフィールのみ閲覧可能に変更
-- Performance: SELECT wrapper for auth.uid() caching (94-99% faster per Supabase docs)
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = id);

-- INSERT Policy: Users can insert own profile on signup
-- Performance: SELECT wrapper for auth.uid() caching (94-99% faster per Supabase docs)
CREATE POLICY "Users can insert own profile on signup"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = id);

-- UPDATE Policy: Users can update own profile
-- Performance: SELECT wrapper for auth.uid() caching (94-99% faster per Supabase docs)
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = id)
WITH CHECK ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = id);

-- DELETE Policy: Users can delete own profile
-- Performance: SELECT wrapper for auth.uid() caching (94-99% faster per Supabase docs)
CREATE POLICY "Users can delete own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = id);

-- Admin Policy: Service role has full access to profiles
CREATE POLICY "Service role has full access to profiles"
ON public.profiles
FOR ALL
TO service_role
USING (true);

-- Comments for clarity
COMMENT ON POLICY "Users can view own profile" ON public.profiles
IS 'ユーザーは自分のプロフィールのみ閲覧可能';

COMMENT ON POLICY "Users can insert own profile on signup" ON public.profiles
IS 'サインアップ時に自分のプロフィール作成可能';

COMMENT ON POLICY "Users can update own profile" ON public.profiles
IS 'ユーザーは自分のプロフィールのみ更新可能';

COMMENT ON POLICY "Users can delete own profile" ON public.profiles
IS 'ユーザーは自分のプロフィールのみ削除可能（アカウント削除時）';

COMMENT ON POLICY "Service role has full access to profiles" ON public.profiles
IS '管理者（Service Role）はすべてのプロフィールにフルアクセス可能';

-- ============================================================================
-- Part 2: login_attempts テーブルのRLSポリシー（#613）
-- ============================================================================

-- Drop existing policies if they exist (from 20251023231853_create_login_attempts_table.sql)
DROP POLICY IF EXISTS "Admin can view all login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Service role has full access" ON public.login_attempts;

-- Enable RLS on login_attempts table (if not already enabled)
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Only admins can view login attempts
CREATE POLICY "Admin can view all login attempts"
ON public.login_attempts
FOR SELECT
TO service_role
USING (true);

-- INSERT Policy: System can log all login attempts (anonymous + authenticated)
-- This is the key policy that was missing - allows unauthenticated login attempts to be logged
CREATE POLICY "System can log login attempts"
ON public.login_attempts
FOR INSERT
WITH CHECK (true);

-- Service Role Policy: Full access for admin operations
CREATE POLICY "Service role has full access to login_attempts"
ON public.login_attempts
FOR ALL
TO service_role
USING (true);

-- Comments for clarity
COMMENT ON POLICY "Admin can view all login attempts" ON public.login_attempts
IS '管理者（Service Role）のみがすべてのログイン履歴を閲覧可能';

COMMENT ON POLICY "System can log login attempts" ON public.login_attempts
IS 'システムがログイン試行を記録できる（未認証ユーザーのログイン失敗も記録）';

COMMENT ON POLICY "Service role has full access to login_attempts" ON public.login_attempts
IS '管理者（Service Role）はすべてのログイン履歴にフルアクセス可能';

-- ============================================================================
-- Verification
-- ============================================================================

-- Check that RLS is enabled
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'RLS is not enabled on profiles table';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'login_attempts' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'RLS is not enabled on login_attempts table';
  END IF;

  RAISE NOTICE 'RLS policies successfully applied';
END $$;
