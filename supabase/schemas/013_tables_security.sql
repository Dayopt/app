-- ============================================================
-- セキュリティ関連テーブル（読み物用 — CLIでは使用しない）
-- ============================================================
-- 最終同期日: 2026-07-26
-- 同期対象 migration:
--   - 20260317022728_fix_security_definer_idor.sql
--   - 20260414150000_drop_login_attempts_and_auth_audit_logs.sql
--   - 20260726033000_expand_user_data_purge_generation.sql
--   - 20260726040100_add_external_authority_maintenance.sql
--   - 20260726040200_harden_calendar_revoke_expiry.sql
--

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

-- user data purgeと外部authority maintenanceの内部状態。
-- private schemaかつ全application roleのdirect権限を剥奪し、service-role RPCだけが触る。
CREATE TABLE private.user_data_controls (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  generation BIGINT NOT NULL DEFAULT 0,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

-- local purge後にGoogle grantを失効するためのrevoke-only outbox。
-- 同じ旧connectionから回転前後の複数tokenが発生し得るため、source IDは一意にしない。
-- 暗号文は成功時に即削除し、失敗時も23時間59分でexpiry対象となる。
CREATE TABLE private.calendar_revoke_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_connection_id UUID NOT NULL,
  provider TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL
    DEFAULT (pg_catalog.clock_timestamp() + INTERVAL '23 hours 59 minutes')
);

-- 任意payloadを持たない、90日retention対象のintegration security event。
CREATE TABLE private.integration_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
