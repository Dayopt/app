-- ============================================================
-- oauth_authorization_codes: PKCE authorization code grant の中間 state
--
-- /oauth/authorize で発行 → /oauth/token で消費する short-lived code
-- (TTL 60 秒、single use)。
--
-- service-role 経由でのみ insert / select / update する。RLS は有効化
-- するが user 向け policy は持たない (anon / authenticated は全 deny)。
--
-- See docs/design/mcp-server/overview.md Decision 4.
-- ============================================================

CREATE TABLE public.oauth_authorization_codes (
  code_hash             TEXT        PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id             TEXT        NOT NULL
    CHECK (client_id IN ('claude-ai', 'chatgpt', 'cursor', 'unknown')),
  redirect_uri          TEXT        NOT NULL,
  code_challenge        TEXT        NOT NULL,
  code_challenge_method TEXT        NOT NULL CHECK (code_challenge_method = 'S256'),
  scopes                TEXT[]      NOT NULL,
  expires_at            TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds'),
  consumed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

-- 期限切れ未消費 code の掃除用 partial index (Phase 2 で cron sweep を追加)
CREATE INDEX idx_oauth_authorization_codes_expires
  ON public.oauth_authorization_codes(expires_at)
  WHERE consumed_at IS NULL;
