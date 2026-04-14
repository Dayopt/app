-- ============================================================
-- セキュリティ関連テーブル（読み物用 — CLIでは使用しない）
-- ============================================================

-- login_attempts: 削除済み（20260414150000_drop_login_attempts_and_auth_audit_logs.sql）
-- auth_audit_logs: 削除済み（同上）

-- mfa_recovery_codes: MFAリカバリーコード
-- code_hash のみ保存（平文は保存しない）
-- use_recovery_code() RPC で使用マーク
CREATE TABLE public.mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,            -- NULL = 未使用
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
