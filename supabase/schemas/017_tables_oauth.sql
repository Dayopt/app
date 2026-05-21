-- ============================================================
-- OAuth 2.1 関連テーブル (読み物用 — CLIでは使用しない)
-- ============================================================
--
-- Phase 1 で MCP Remote Server 用に api_keys → oauth_tokens に rename + 拡張。
-- 詳細: apps/storybook/docs/product/projects/mcp-server/overview.mdx
--
-- Migration:
--   20260501000000_oauth_tokens_from_api_keys.sql  (rename + extend)
--   20260501000100_oauth_authorization_codes.sql   (PKCE code 中間 state)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- oauth_tokens: opaque access / refresh token storage
--
-- token_hash:      SHA-256 ハッシュ。生 token (dop_at_... / dop_rt_...) は DB 不在
-- token_type:      'access' (5min TTL) / 'refresh' (30day TTL, rotation あり)
-- client_id:       Phase 1 は static allowlist。Phase 2 で oauth_clients FK 化
-- scopes:          OAuth scope 配列。Phase 1 は ['read:entries']
-- expires_at:      token 失効時刻
-- revoked_at:      revoke 時刻 (Phase 1.5 webhook / user-initiated revoke)
-- parent_token_id: refresh で発行された access の親 refresh (chain 追跡)
-- last_used_at:    最後の Bearer 利用時刻 (security 衛生管理用)
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.oauth_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL UNIQUE,
  token_type      TEXT        NOT NULL CHECK (token_type IN ('access', 'refresh')),
  client_id       TEXT        NOT NULL CHECK (client_id IN ('claude-ai', 'chatgpt', 'cursor', 'unknown')),
  scopes          TEXT[]      NOT NULL DEFAULT ARRAY['read:entries']::TEXT[],
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  parent_token_id UUID        REFERENCES public.oauth_tokens(id) ON DELETE SET NULL,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- oauth_authorization_codes: PKCE code grant の中間 state
--
-- /oauth/authorize で発行 → /oauth/token で消費。TTL 60 秒、single use。
-- service-role 経由でのみ insert / select / update。
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.oauth_authorization_codes (
  code_hash             TEXT        PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id             TEXT        NOT NULL CHECK (client_id IN ('claude-ai', 'chatgpt', 'cursor', 'unknown')),
  redirect_uri          TEXT        NOT NULL,
  code_challenge        TEXT        NOT NULL,
  code_challenge_method TEXT        NOT NULL CHECK (code_challenge_method = 'S256'),
  scopes                TEXT[]      NOT NULL,
  expires_at            TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds'),
  consumed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
