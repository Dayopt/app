-- ============================================================
-- OAuth 2.1 / MCP DB基盤（読み物用 — CLIでは使用しない）
-- ============================================================
-- Candidate 4 が connection-bound OAuth のstored scope契約を追加し、Candidate 5 が
-- 既存行まで含めて検証済みにした。
-- MCP write tool はまだ公開せず、global gate OFF + client list empty が停止条件。
-- 実際のマイグレーションは migrations/ を参照。
-- 最終同期日: 2026-08-10
-- Candidate 5 terminal migration: 20260730090200_validate_mcp_oauth_scope_constraints.sql
-- 同期対象 migration:
--   - 20260501000000_oauth_tokens_from_api_keys.sql
--   - 20260501000100_oauth_authorization_codes.sql
--   - 20260514000918_mcp_phase_1_5.sql
--   - 20260604230607_harden_function_execute_privileges.sql
--   - 20260729062428_mcp_oauth_connections_expand.sql
--   - 20260729062430_oauth_refresh_rotation_hardening.sql
--   - 20260729062433_oauth_connection_cutover_hardening.sql
--   - 20260729062445_mcp_mutation_envelope_foundation.sql
--   - 20260729062447_allow_mcp_receipt_connection_detach.sql
--   - 20260729062449_mcp_plan_create_apply.sql
--   - 20260729062453_mcp_plan_mutations_apply.sql
--   - 20260729062502_mcp_record_mutations_apply.sql
--   - 20260729073122_mcp_stage1_user_write_serialization.sql
--   - 20260729073123_mcp_stage1_legacy_writer_compatibility.sql
--   - 20260729073124_mcp_stage1_revision_fence.sql
--   - 20260729073125_mcp_environment_identity_client_fence.sql
--   - 20260729073126_mcp_stage1_receipt_generation_lifecycle.sql
--   - 20260729073127_legacy_linked_record_restore_compatibility.sql
--   - 20260730090100_mcp_oauth_scope_constraints_not_valid.sql
--   - 20260730090200_validate_mcp_oauth_scope_constraints.sql
--   - 20260810013820_observe_legacy_oauth_bind.sql
--   - 20260810070002_add_oauth_retention_cleanup_rpcs.sql
--   - 20260810085241_bound_oauth_connection_cleanup_cascade.sql
--
-- 下記3 CHECKはCandidate 4がNOT VALIDで追加し、Candidate 5が読み取り専用preflightの後に
-- VALIDATE CONSTRAINTで検証済みへ進めた。この宣言スキーマは読み物なので、
-- 検証状態（convalidated）はmigrationだけが持つ。
-- ============================================================

-- mcp_environment_identity: DBが所有する一度きり・変更不可のauthority identity。
-- 既存DBはProductionへbackfillする。データのないPR Previewだけがservice-role RPCで
-- exact Vercel URL + Supabase project ref/JWT refを一度だけ設定できる。
-- Persistent Stagingはこのモデルに含めない。
CREATE TABLE public.mcp_environment_identity (
  singleton_key BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton_key),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'preview')),
  authorization_server_uri TEXT NOT NULL,
  resource_uri TEXT NOT NULL UNIQUE,
  supabase_project_ref TEXT,
  provisioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- oauth_connections: 1回の承認と1つのrefresh familyを表す安定した接続
CREATE TABLE public.oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,              -- claude-ai / chatgpt / cursor / unknown
  resource_uri TEXT NOT NULL REFERENCES public.mcp_environment_identity(resource_uri),
  scopes TEXT[] NOT NULL,
  consent_version INTEGER NOT NULL DEFAULT 1,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  reauth_required_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  write_enabled_at TIMESTAMPTZ,         -- connection作成時だけ設定できるclosed-beta marker
  legacy_read_only BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oauth_connections_write_requires_read_entries_check CHECK (
    NOT (
      scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    )
    OR scopes @> ARRAY['read:entries']::TEXT[]
  ),
  UNIQUE (id, user_id, client_id, resource_uri)
);

-- oauth_tokens: opaque access / refresh token storage
-- 生tokenは保存せずSHA-256 hashだけを持つ。connection bindingは複合FKでowner/client/resourceも固定。
CREATE TABLE public.oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID,                   -- Insert互換のため型はnullable。CHECKでNULL行を禁止
  token_hash TEXT NOT NULL UNIQUE,
  token_type TEXT NOT NULL,             -- access / refresh
  client_id TEXT NOT NULL,
  resource_uri TEXT,                    -- bridgeがDB identityから補完。CHECKでNULL行を禁止
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read:entries']::TEXT[],
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  parent_token_id UUID REFERENCES public.oauth_tokens(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (connection_id, user_id, client_id, resource_uri)
    REFERENCES public.oauth_connections (id, user_id, client_id, resource_uri)
    ON DELETE CASCADE,
  FOREIGN KEY (resource_uri)
    REFERENCES public.mcp_environment_identity(resource_uri),
  CONSTRAINT oauth_tokens_write_requires_read_entries_check CHECK (
    NOT (
      scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    )
    OR scopes @> ARRAY['read:entries']::TEXT[]
  ),
  CHECK (connection_id IS NOT NULL AND resource_uri IS NOT NULL)
);

-- oauth_authorization_codes: PKCE authorization codeの一回限りの中間state
CREATE TABLE public.oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID,                   -- legacy Insert trigger後のCHECKでNULL行を禁止
  client_id TEXT NOT NULL,
  resource_uri TEXT,                    -- bridgeがDB identityから補完。CHECKでNULL行を禁止
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL CHECK (code_challenge_method = 'S256'),
  scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds'),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (connection_id, user_id, client_id, resource_uri)
    REFERENCES public.oauth_connections (id, user_id, client_id, resource_uri)
    ON DELETE CASCADE,
  FOREIGN KEY (resource_uri)
    REFERENCES public.mcp_environment_identity(resource_uri),
  CONSTRAINT oauth_authorization_codes_write_requires_read_entries_check CHECK (
    NOT (
      scopes && ARRAY[
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    )
    OR scopes @> ARRAY['read:entries']::TEXT[]
  ),
  CHECK (connection_id IS NOT NULL AND resource_uri IS NOT NULL)
);

-- 現行read-only appがconnection_idを送らない期間はBEFORE INSERT triggerで
-- legacy_read_only connectionを作る。code consume後のroot refreshとchild accessは
-- 同じconnection familyを継承する。bridgeはservice-role onlyで、resourceはDB identity
-- から取得し、write/delete scopeを拒否する。

-- oauth_audit_log: MCP tool call audit（payloadやtoken平文は保存しない）
CREATE TABLE public.oauth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id UUID REFERENCES public.oauth_tokens(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- mcp_mutation_control: global AND per-client の二重gate
CREATE TABLE public.mcp_mutation_control (
  singleton_key BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton_key),
  writes_enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_client_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- mcp_mutation_receipts: 成功したtyped mutationの90日idempotency/audit receipt
-- request payloadは保存せず、DBが作ったcanonical digestだけを持つ。
CREATE TABLE public.mcp_mutation_receipts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  operation_id UUID NOT NULL,
  origin_connection_id UUID REFERENCES public.oauth_connections(id) ON DELETE SET NULL,
  envelope_version SMALLINT NOT NULL,
  tool_name TEXT NOT NULL,
  request_digest BYTEA NOT NULL CHECK (octet_length(request_digest) = 32),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('plan', 'record')),
  resource_id UUID NOT NULL,
  resource_version TIMESTAMPTZ NOT NULL,
  resource_deleted_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_generation BIGINT NOT NULL DEFAULT 0 CHECK (data_generation >= 0),
  purged_generation BIGINT,
  purged_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, client_id, operation_id)
);

-- private.user_data_controls はaccount-preserving purge世代をuser単位で保持する。
-- receipt insert時にDBがdata_generationを固定し、purgeで世代を越えたreceiptは
-- tombstoneとしてDM008を返す。Stage 3のpurge command本体はまだ含めない。
--
-- environment_identity / mutation_control / receiptsはRLS有効・browser policyなし。
-- service_roleのdirect mutationも閉じ、typed SECURITY DEFINER RPCだけが変更する。
--
-- Candidate 1の停止条件:
--   writes_enabled = false AND enabled_client_ids = []
-- 旧UI direct UPDATE、tag merge lock順、legacy confirm-dayとの未解決raceはStage 2で
-- app command移行と競合testを終えるまで到達不能にする。

-- private.legacy_oauth_bind_observations: Stage 8-3（candidate 8 destructive
-- cleanup、docs/projects/mcp-plan-track-learn/step-6-candidate-8-cleanup.md）の
-- 主停止指標。bind_legacy_oauth_insert_to_connection() が connection_id を
-- 補完実行するたびに1行append-onlyで記録する（20260810013820）。
-- user_id/token id/client_id等の識別子は持たず、件数・trigger種別・時刻のみ。
-- REVOKE ALLがdefaultで、service_roleにSELECTのみ（read-only preflight用。
-- private schemaのUSAGEもこのmigrationでservice_roleへ再GRANTした — 他の
-- private tableは個別にREVOKE ALL FROM service_roleを維持するため露出は増えない）。
-- 停止条件は「観測窓内のこのtable行数が累積0件」。cleanup drop対象には含めない
-- （trigger drop後の証跡として残す）。
CREATE TABLE private.legacy_oauth_bind_observations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table TEXT NOT NULL
    CHECK (source_table IN ('oauth_authorization_codes', 'oauth_tokens')),
  had_parent BOOLEAN NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);
