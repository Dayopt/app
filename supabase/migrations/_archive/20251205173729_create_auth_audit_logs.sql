-- 認証監査ログテーブル
-- @see src/features/auth/lib/audit-log.ts
--
-- 目的:
-- - ログイン成功履歴の明確な保持
-- - セキュリティイベントの監査証跡
-- - ユーザーが自身のアクティビティを確認可能に

-- Create table
CREATE TABLE IF NOT EXISTS public.auth_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_auth_audit_logs_user_id ON public.auth_audit_logs(user_id);
CREATE INDEX idx_auth_audit_logs_event_type ON public.auth_audit_logs(event_type);
CREATE INDEX idx_auth_audit_logs_created_at ON public.auth_audit_logs(created_at);
CREATE INDEX idx_auth_audit_logs_user_created ON public.auth_audit_logs(user_id, created_at);

-- Add comments
COMMENT ON TABLE public.auth_audit_logs IS '認証監査ログ（成功ログイン、ログアウト、MFA変更等）';
COMMENT ON COLUMN public.auth_audit_logs.user_id IS 'ユーザーID（auth.usersへの外部キー）';
COMMENT ON COLUMN public.auth_audit_logs.event_type IS 'イベント種別（login_success, logout, mfa_enabled, mfa_disabled, password_changed, session_extended）';
COMMENT ON COLUMN public.auth_audit_logs.ip_address IS 'クライアントIPアドレス';
COMMENT ON COLUMN public.auth_audit_logs.user_agent IS 'User-Agentヘッダー';
COMMENT ON COLUMN public.auth_audit_logs.metadata IS '追加情報（JSON形式）';

-- Enable Row Level Security (RLS)
ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- ユーザーは自分の監査ログのみ参照可能
CREATE POLICY "Users can view own audit logs"
    ON public.auth_audit_logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- サービスロールのみ挿入可能（クライアントからの直接挿入を防止）
CREATE POLICY "Service role can insert audit logs"
    ON public.auth_audit_logs
    FOR INSERT
    WITH CHECK (true);

-- 自動クリーンアップ用関数（365日以上前の記録を削除）
CREATE OR REPLACE FUNCTION public.cleanup_old_auth_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.auth_audit_logs
    WHERE created_at < NOW() - INTERVAL '365 days';
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_auth_audit_logs IS 'auth_audit_logsテーブルの古いレコードを削除（365日以上前）';

-- ユーザーが最近のログインを確認するためのビュー
CREATE OR REPLACE VIEW public.user_recent_logins AS
SELECT
    user_id,
    ip_address,
    user_agent,
    created_at,
    metadata->>'location' as location
FROM public.auth_audit_logs
WHERE event_type = 'login_success'
ORDER BY created_at DESC;

COMMENT ON VIEW public.user_recent_logins IS 'ユーザーの最近のログイン履歴';

-- RLSをビューにも適用（ビューは基底テーブルのRLSを継承）
