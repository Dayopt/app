-- ============================================================
-- OAuth 2.1 / MCP authority tables (読み物用 — CLIでは使用しない)
-- ============================================================
--
-- Migration:
--   20260501000000_oauth_tokens_from_api_keys.sql
--   20260501000100_oauth_authorization_codes.sql
--   20260514000918_mcp_phase_1_5.sql
--   20260722225603_mcp_oauth_connections.sql
--   20260722231138_oauth_refresh_rotation_hardening.sql
--   20260722231715_oauth_connection_cutover_hardening.sql
--   20260726013339_mcp_environment_identity.sql
--   20260726015311_mcp_environment_authority_binding.sql
--   20260726021453_fix_mcp_environment_legacy_binding.sql
--   20260726033000_expand_user_data_purge_generation.sql
--   20260726040100_add_external_authority_maintenance.sql
--   20260729061330_mcp_preview_environment_identity.sql
--
-- 最終同期日: 2026-07-29
-- 正確なconstraint / index / privilegeは上記migrationとRLS snapshotを正とする。
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- mcp_environment_identity: DBが所有する不変のOAuth/MCP identity
--
-- 0行は未provision、1行は確定済み。UPDATE / DELETEはtriggerで拒否する。
-- exactなProduction、Staging、またはPreview tupleだけを許可し、
-- PreviewはSupabase project refも固定する。resource_uriはUNIQUE。
-- connection / code / tokenはこのresource_uriへFKでbindされる。
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.mcp_environment_identity (
  singleton_key           BOOLEAN     PRIMARY KEY DEFAULT true CHECK (singleton_key),
  environment             TEXT        NOT NULL
    CHECK (environment IN ('production', 'staging', 'preview')),
  authorization_server_uri TEXT       NOT NULL,
  resource_uri            TEXT        NOT NULL UNIQUE,
  supabase_project_ref     TEXT,
  provisioned_at          TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- ────────────────────────────────────────────────────────────
-- oauth_connections: consent grantとrefresh familyのauthority
--
-- revoke、90日reauth、scope、connection単位write gateを保持する。
-- legacy_read_only=trueのconnectionはwrite/delete scopeを持てない。
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.oauth_connections (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id          TEXT        NOT NULL,
  resource_uri       TEXT        NOT NULL
    REFERENCES public.mcp_environment_identity(resource_uri),
  scopes             TEXT[]      NOT NULL,
  consent_version    INTEGER     NOT NULL DEFAULT 1,
  authorized_at      TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  last_used_at       TIMESTAMPTZ,
  last_refreshed_at  TIMESTAMPTZ,
  reauth_required_at TIMESTAMPTZ NOT NULL DEFAULT (pg_catalog.now() + INTERVAL '90 days'),
  write_enabled_at   TIMESTAMPTZ,
  write_disabled_at  TIMESTAMPTZ,
  legacy_read_only   BOOLEAN     NOT NULL DEFAULT false,
  revoked_at         TIMESTAMPTZ,
  revoked_reason     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (id, user_id, client_id, resource_uri)
);

-- ────────────────────────────────────────────────────────────
-- oauth_tokens: opaque access / refresh token storage
--
-- 生tokenは保存せずSHA-256 hashだけを保持する。accessは5分、refreshは30日。
-- rotated_atは通常rotation、revoked_atはconnection/family失効も表す。
-- connection/resource複合FKとenvironment FKの両方でauthorityを固定する。
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.oauth_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL UNIQUE,
  token_type      TEXT        NOT NULL CHECK (token_type IN ('access', 'refresh')),
  client_id       TEXT        NOT NULL,
  scopes          TEXT[]      NOT NULL DEFAULT ARRAY['read:entries']::TEXT[],
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  rotated_at      TIMESTAMPTZ,
  parent_token_id UUID        REFERENCES public.oauth_tokens(id) ON DELETE SET NULL,
  connection_id   UUID        NOT NULL,
  resource_uri    TEXT        NOT NULL
    REFERENCES public.mcp_environment_identity(resource_uri),
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  FOREIGN KEY (connection_id, user_id, client_id, resource_uri)
    REFERENCES public.oauth_connections(id, user_id, client_id, resource_uri)
    ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- oauth_authorization_codes: PKCE S256 code grantの中間state
--
-- /oauth/authorizeで発行し、/oauth/tokenで一度だけ消費する。
-- identity確認はconsumed_at更新より先に行う。
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.oauth_authorization_codes (
  code_hash             TEXT        PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id             TEXT        NOT NULL,
  redirect_uri          TEXT        NOT NULL,
  code_challenge        TEXT        NOT NULL,
  code_challenge_method TEXT        NOT NULL CHECK (code_challenge_method = 'S256'),
  scopes                TEXT[]      NOT NULL,
  connection_id         UUID        NOT NULL,
  resource_uri          TEXT        NOT NULL
    REFERENCES public.mcp_environment_identity(resource_uri),
  expires_at            TIMESTAMPTZ NOT NULL DEFAULT (pg_catalog.now() + INTERVAL '60 seconds'),
  consumed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  FOREIGN KEY (connection_id, user_id, client_id, resource_uri)
    REFERENCES public.oauth_connections(id, user_id, client_id, resource_uri)
    ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- oauth_audit_log: payloadを持たないMCP tool call audit
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.oauth_audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id   UUID        REFERENCES public.oauth_tokens(id) ON DELETE SET NULL,
  client_id  TEXT        NOT NULL,
  tool_name  TEXT        NOT NULL,
  called_at  TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX idx_oauth_audit_log_user_called
  ON public.oauth_audit_log(user_id, called_at DESC);

-- Retention:
--   authorization code / access token hash: terminal後24時間
--   refresh token hash: expired / rotated / revoked後30日
--   connection: revoked / reauth expiry後90日
--   success mutation receipt: 90日。purge後はresource本文を持たないtombstone
-- cleanupはservice-role限定RPCがDB時刻とbounded batchで実行する。
