-- 汎用セキュリティ監査ログテーブル
-- @see src/lib/audit/logger.ts
-- @see OWASP A09:2021 - Security Logging and Monitoring Failures
--
-- 目的:
-- - セキュリティイベントの包括的な記録
-- - 不正アクセス試行の検出と分析
-- - コンプライアンス要件への対応
--
-- auth_audit_logsとの違い:
-- - auth_audit_logs: ユーザー向け（自分のログイン履歴を確認）
-- - audit_logs: 管理者向け（セキュリティ監視・インシデント対応）

-- Create table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT,
    ip_address INET,
    user_agent TEXT,
    resource TEXT,
    action TEXT,
    metadata JSONB DEFAULT '{}',
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX idx_audit_logs_severity ON public.audit_logs(severity);
CREATE INDEX idx_audit_logs_ip_address ON public.audit_logs(ip_address);
CREATE INDEX idx_audit_logs_severity_timestamp ON public.audit_logs(severity, timestamp DESC);

-- Add comments
COMMENT ON TABLE public.audit_logs IS 'セキュリティ監査ログ（OWASP準拠）';
COMMENT ON COLUMN public.audit_logs.event_type IS 'イベント種別（login_failure, unauthorized_access_attempt, rate_limit_exceeded等）';
COMMENT ON COLUMN public.audit_logs.severity IS '重要度（info, warning, error, critical）';
COMMENT ON COLUMN public.audit_logs.user_id IS 'ユーザーID（認証済みの場合）';
COMMENT ON COLUMN public.audit_logs.session_id IS 'セッションID';
COMMENT ON COLUMN public.audit_logs.ip_address IS 'クライアントIPアドレス（INET型）';
COMMENT ON COLUMN public.audit_logs.resource IS 'アクセス対象リソース（APIエンドポイント等）';
COMMENT ON COLUMN public.audit_logs.action IS '実行されたアクション';
COMMENT ON COLUMN public.audit_logs.metadata IS '追加情報（JSON形式）';
COMMENT ON COLUMN public.audit_logs.success IS '操作の成功/失敗';
COMMENT ON COLUMN public.audit_logs.error_message IS 'エラーメッセージ（失敗時）';

-- Enable Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- 管理者のみ閲覧可能（通常ユーザーはアクセス不可）
-- Note: 管理者ロール機能が実装されたら、適切なポリシーに更新
CREATE POLICY "Service role can view audit logs"
    ON public.audit_logs
    FOR SELECT
    USING (auth.jwt() ->> 'role' = 'service_role');

-- サービスロールのみ挿入可能
CREATE POLICY "Service role can insert audit logs"
    ON public.audit_logs
    FOR INSERT
    WITH CHECK (true);

-- 自動クリーンアップ用関数（90日以上前の記録を削除）
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.audit_logs
    WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_audit_logs IS 'audit_logsテーブルの古いレコードを削除（90日以上前）';

-- Critical/Errorイベントを素早く検索するためのパーシャルインデックス
CREATE INDEX idx_audit_logs_critical_events
    ON public.audit_logs(timestamp DESC)
    WHERE severity IN ('critical', 'error');
