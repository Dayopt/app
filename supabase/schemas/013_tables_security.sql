-- ============================================================
-- セキュリティ関連テーブル（読み物用 — CLIでは使用しない）
-- ============================================================

-- login_attempts: ログイン試行記録
-- record_login_attempt() RPC 経由で INSERT（直接INSERTは service_role のみ）
-- 90日で自動クリーンアップ（pg_cron: cleanup-login-attempts）
CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  attempt_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_successful BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- auth_audit_logs: 認証監査ログ
-- service_role のみ INSERT 可能
-- 365日で自動クリーンアップ（pg_cron: cleanup-auth-audit-logs）
CREATE TABLE public.auth_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,      -- login/logout/password_change/mfa_enroll etc.
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  geo_country TEXT,
  geo_city TEXT
);

-- mfa_recovery_codes: MFAリカバリーコード
-- code_hash のみ保存（平文は保存しない）
-- use_recovery_code() RPC で使用マーク
CREATE TABLE public.mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,           -- NULL = 未使用
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
