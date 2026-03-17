-- Create login_attempts table for account lockout functionality
-- @see src/features/auth/lib/account-lockout.ts

-- Create table
CREATE TABLE IF NOT EXISTS public.login_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    attempt_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_successful BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_login_attempts_email ON public.login_attempts(email);
CREATE INDEX idx_login_attempts_attempt_time ON public.login_attempts(attempt_time);
CREATE INDEX idx_login_attempts_email_time ON public.login_attempts(email, attempt_time);

-- Add comments
COMMENT ON TABLE public.login_attempts IS 'ログイン試行履歴（アカウントロックアウト機能用）';
COMMENT ON COLUMN public.login_attempts.email IS 'ログイン試行されたメールアドレス';
COMMENT ON COLUMN public.login_attempts.attempt_time IS 'ログイン試行日時';
COMMENT ON COLUMN public.login_attempts.is_successful IS 'ログイン成功/失敗フラグ';
COMMENT ON COLUMN public.login_attempts.ip_address IS 'クライアントIPアドレス';
COMMENT ON COLUMN public.login_attempts.user_agent IS 'User-Agentヘッダー';

-- Enable Row Level Security (RLS)
-- Note: RLS policies are defined in 20251024114638_rls_policies_complete.sql
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- 自動クリーンアップ用関数（オプション：古いレコードを削除）
-- 90日以上前の記録を削除
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.login_attempts
    WHERE attempt_time < NOW() - INTERVAL '90 days';
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_login_attempts IS 'login_attemptsテーブルの古いレコードを削除（90日以上前）';
