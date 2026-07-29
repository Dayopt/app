-- ============================================================
-- セキュリティ関連テーブル（読み物用 — CLIでは使用しない）
-- ============================================================
-- 最終同期日: 2026-07-29
-- 同期対象 migration:
--   - 20260317022728_fix_security_definer_idor.sql
--   - 20260414150000_drop_login_attempts_and_auth_audit_logs.sql
--   - 20260726033000_expand_user_data_purge_generation.sql
--   - 20260726040100_add_external_authority_maintenance.sql
--   - 20260726040200_harden_calendar_revoke_expiry.sql
--   - 20260726060000_calendar_authority_fence_foundation.sql
--   - 20260726060100_calendar_authority_fence_commands.sql
--   - 20260726060200_fenced_calendar_authority_writers.sql
--   - 20260726060300_fenced_calendar_revoke_worker.sql
--   - 20260726060400_calendar_account_deletion_fence.sql
--   - 20260726060700_bind_user_data_purge_generation.sql
--   - 20260726060800_account_deletion_gate_foundation.sql
--   - 20260726060850_neutralize_account_deletion_gate.sql
--   - 20260726060860_bind_calendar_account_deletion.sql
--   - 20260726060900_fail_closed_account_deletion_control.sql
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
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  last_purge_operation_id UUID,
  last_purge_expected_generation BIGINT,
  last_purge_project_key TEXT,
  last_purge_completed_at TIMESTAMPTZ
);

-- account削除の有効化状態。singletonはDELETE/TRUNCATE triggerで保護する。
CREATE TABLE private.account_deletion_control (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE,
  activation_version INTEGER NOT NULL DEFAULT 0, -- 0 / 1
  activated_at TIMESTAMPTZ
);

-- auth.users削除前のgenericな3段階cleanup状態。
-- provider固有targetはCalendar / Billingそれぞれのbinding tableが所有する。
CREATE TABLE private.account_deletion_operations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  deletion_id UUID NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'preparing', -- preparing / ready
  started_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  ready_at TIMESTAMPTZ,
  UNIQUE (user_id, deletion_id)
);

CREATE TABLE private.account_deletion_steps (
  user_id UUID NOT NULL,
  deletion_id UUID NOT NULL,
  step TEXT NOT NULL,                 -- calendar / storage / billing
  state TEXT NOT NULL DEFAULT 'pending', -- pending / in_progress / completed
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, step),
  FOREIGN KEY (user_id, deletion_id)
    REFERENCES private.account_deletion_operations(user_id, deletion_id)
    ON DELETE CASCADE
);

-- generic account deletionとCalendar側の削除intentを束縛する。
CREATE TABLE private.calendar_account_deletion_bindings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  generic_deletion_id UUID NOT NULL UNIQUE,
  calendar_deletion_id UUID NOT NULL UNIQUE,
  calendar_required BOOLEAN NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  FOREIGN KEY (user_id, generic_deletion_id)
    REFERENCES private.account_deletion_operations(user_id, deletion_id)
    ON DELETE CASCADE
);

-- private.user_data_purge_operationsは20260726060600で一時作成後、
-- 20260726060700でuser_data_controlsのO(1) replay tupleへ置換して削除済み。

-- このDBが所有するimmutableなGoogle Cloud project / OAuth client identity。
-- activation_version=1は旧writer停止後の明示cutoverでのみ設定する。
CREATE TABLE private.calendar_authority_projects (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE,
  project_key TEXT NOT NULL UNIQUE,
  oauth_client_id TEXT NOT NULL UNIQUE,
  provisioned_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  activation_version INTEGER NOT NULL DEFAULT 0,
  activated_at TIMESTAMPTZ
);

-- project、Google sub、legacy quarantineごとの単調増加authority fence。
CREATE TABLE private.calendar_authority_fences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key TEXT NOT NULL
    REFERENCES private.calendar_authority_projects(project_key) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL,               -- project / subject / quarantine
  provider_account_id TEXT,               -- subjectだけGoogle subを保持
  epoch BIGINT NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'ready',    -- ready / pending
  pending_operation_count INTEGER NOT NULL DEFAULT 0,
  ready_after_project_epoch BIGINT NOT NULL DEFAULT 0,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

-- provider revokeのpayload-free replay ledger。
-- 暗号文は持たず、terminal receiptだけを最大90日保持する。
CREATE TABLE private.calendar_revoke_operations (
  operation_id UUID PRIMARY KEY,
  project_fence_id UUID NOT NULL
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  subject_fence_id UUID NOT NULL
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  subject_fence_epoch BIGINT NOT NULL,
  source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_connection_id UUID NOT NULL,
  account_deletion_id UUID,
  account_deletion_item_kind TEXT,        -- connection / outbox
  account_deletion_item_id UUID,
  operation_kind TEXT NOT NULL,
  request_digest BYTEA NOT NULL,
  state TEXT NOT NULL,                    -- pending / revoke_guarded / expiry_guarded / revoked / expired
  initial_result TEXT NOT NULL,
  active_lease_id UUID,
  active_lease_expires_at TIMESTAMPTZ,
  provider_attempt_started_at TIMESTAMPTZ,
  provider_attempt_outcome TEXT,          -- confirmed / unconfirmed / not_attempted
  provider_attempt_reason TEXT,           -- decrypt_failed / source_expired
  guard_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  delete_after TIMESTAMPTZ
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
    DEFAULT (pg_catalog.clock_timestamp() + INTERVAL '23 hours 59 minutes'),
  authority_fence_id UUID
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  authority_epoch BIGINT
);

-- 成功したconnection save / token rotationのimmutable receipt。
CREATE TABLE private.calendar_authority_command_receipts (
  operation_id UUID PRIMARY KEY,
  command_kind TEXT NOT NULL,             -- connection_save / token_rotation
  project_fence_id UUID NOT NULL
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  subject_fence_id UUID NOT NULL
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_connection_id UUID NOT NULL,
  resource_connection_id UUID NOT NULL,
  request_digest BYTEA NOT NULL,
  result TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  delete_after TIMESTAMPTZ NOT NULL
);

-- OAuth state / PKCEのdigestとDB発行save identityを10分だけ保持する。
-- code、verifier、tokenの平文・暗号文は保存しない。
CREATE TABLE private.calendar_oauth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_fence_id UUID NOT NULL
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_digest BYTEA NOT NULL UNIQUE,
  verifier_digest BYTEA NOT NULL,
  operation_id UUID NOT NULL UNIQUE,
  connection_id UUID NOT NULL UNIQUE,
  data_generation BIGINT NOT NULL,
  project_epoch BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  delete_after TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claim_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result TEXT
);

-- auth.users削除前に全Calendar ciphertextのterminal receiptをsealする境界。
CREATE TABLE private.calendar_account_deletion_intents (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  deletion_id UUID NOT NULL UNIQUE,
  project_fence_id UUID NOT NULL
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'preparing', -- preparing / ready
  started_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  ready_at TIMESTAMPTZ,
  sealed_operation_count INTEGER,
  sealed_receipt_digest BYTEA
);

-- 任意payloadを持たない、90日retention対象のintegration security event。
CREATE TABLE private.integration_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
