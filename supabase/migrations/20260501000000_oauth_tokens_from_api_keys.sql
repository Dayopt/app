-- ============================================================
-- api_keys → oauth_tokens への rename + OAuth 用 schema 拡張
--
-- 経緯:
--   20260415200100_create_api_keys.sql で「Obsidian / Claude Code 等の
--   外部連携用 API キー」を想定して api_keys テーブルを作成。実装は
--   始まらず未使用 vestige のまま、feedd7641 で MCP の受け皿として
--   温存されていた。
--
-- 方針 (apps/storybook/docs/product/projects/mcp-server/overview.mdx Decision 1, 4):
--   API key 認証は破棄し、OAuth 2.1 + opaque token model に統一する。
--   既存テーブルが未使用なため安全に rename + 拡張可能。
--
-- 主な変更:
--   - api_keys → oauth_tokens に rename
--   - key_hash → token_hash に rename
--   - name (NOT NULL) を drop (client_id で識別、ユーザー label 不要)
--   - token_type / client_id / scopes / expires_at / revoked_at /
--     parent_token_id を追加
--   - INSERT policy を削除 (service-role のみが /oauth/token route から
--     直 insert する)
--   - UPDATE policy を追加 (Phase 1.5 の user-initiated revoke 用)
--   - DELETE policy を削除 (revoked_at で論理削除に統一)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. 既存 RLS policy を drop
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can create own api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can delete own api_keys" ON public.api_keys;

-- ────────────────────────────────────────────────────────────
-- 2. table / column rename
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.api_keys RENAME TO oauth_tokens;
ALTER TABLE public.oauth_tokens RENAME COLUMN key_hash TO token_hash;

-- ────────────────────────────────────────────────────────────
-- 3. column 削除 (OAuth token は user-supplied name 不要)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.oauth_tokens DROP COLUMN name;

-- ────────────────────────────────────────────────────────────
-- 4. column 追加
--   token_type:  'access' / 'refresh'
--   client_id:   'claude-ai' / 'chatgpt' / 'cursor' / 'unknown' (Phase 1)
--                Phase 2 で oauth_clients テーブル + FK に切り替え
--   scopes:      OAuth scope 配列、Phase 1 は ['read:entries']
--   expires_at:  access は 5min、refresh は 30day
--   revoked_at:  Phase 1 は webhook 未実装、緊急 DB 直 UPDATE 用に予約
--   parent_token_id: refresh chain (refresh で発行された access の親 refresh)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.oauth_tokens
  ADD COLUMN token_type      TEXT        NOT NULL DEFAULT 'access'
    CHECK (token_type IN ('access', 'refresh')),
  ADD COLUMN client_id       TEXT        NOT NULL DEFAULT 'unknown'
    CHECK (client_id IN ('claude-ai', 'chatgpt', 'cursor', 'unknown')),
  ADD COLUMN scopes          TEXT[]      NOT NULL DEFAULT ARRAY['read:entries']::TEXT[],
  ADD COLUMN expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  ADD COLUMN revoked_at      TIMESTAMPTZ,
  ADD COLUMN parent_token_id UUID        REFERENCES public.oauth_tokens(id) ON DELETE SET NULL;

-- DEFAULT は migration 時の補完用。新規 row では明示指定する
ALTER TABLE public.oauth_tokens ALTER COLUMN token_type DROP DEFAULT;
ALTER TABLE public.oauth_tokens ALTER COLUMN client_id  DROP DEFAULT;
ALTER TABLE public.oauth_tokens ALTER COLUMN expires_at DROP DEFAULT;
-- scopes default は維持 (Phase 1 read:entries のみで意味的に妥当)

-- ────────────────────────────────────────────────────────────
-- 5. index rename + 追加
-- ────────────────────────────────────────────────────────────
ALTER INDEX IF EXISTS public.idx_api_keys_user_id RENAME TO idx_oauth_tokens_user_id;

CREATE INDEX idx_oauth_tokens_token_hash
  ON public.oauth_tokens(token_hash);

-- 接続済み client UI / revocation 用の partial index
CREATE INDEX idx_oauth_tokens_user_active
  ON public.oauth_tokens(user_id) WHERE revoked_at IS NULL;

-- ────────────────────────────────────────────────────────────
-- 6. RLS policy 再作成
--   SELECT: ユーザーは自分の token を一覧 (Phase 1.5 の接続済み client UI)
--   UPDATE: ユーザーは自分の token を revoke (revoked_at を打つ。Phase 1.5)
--   INSERT: 無し (/oauth/token handler が service-role で insert)
--   DELETE: 無し (revoked_at で論理削除に統一)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own oauth_tokens" ON public.oauth_tokens
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own oauth_tokens" ON public.oauth_tokens
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
