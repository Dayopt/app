-- OAuth scope allowlist の 4 箇所（CHECK 制約 3 本 + grant 関数本体の配列）を
-- `private.oauth_supported_scopes_v1()` 単一定義へ一元化する（#2183）。
--
-- 背景: #2174 実装時、この allowlist が 4 箇所に分散していることが判明した。
-- scope を 1 つ足す/外すたびに 4 箇所を人手で揃える必要があり、1 箇所でも
-- 漏らすと壊れ方が非対称（CHECK だけ直すと新規接続が 22023 で失敗、関数だけ
-- 直すと保存が 23514 で落ちる）。20260818150000 で `read:tags` → `read:activities`
-- 置換時にこの 4 箇所同期を人手で行った実績があり、次回はその手作業自体を
-- 無くす。TS 側 `SUPPORTED_SCOPES`（apps/product/src/lib/oauth-server/scopes.ts）
-- とは別ランタイムのため単一化できないが、DB 側は 1 関数 4 参照に閉じる。
--
-- IMMUTABLE な定数配列を返すだけの関数なので CHECK 制約から安全に呼べる。
-- `private.require_mcp_environment_resource_v1` と同じ REVOKE ALL パターンに
-- 揃える: この allowlist は SECURITY DEFINER の grant/token 発行関数経由でのみ
-- 評価される（oauth_tokens 等は直接 INSERT されず RPC 経由。owner 権限で
-- 実行されるため REVOKE ALL でも動く）。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. 単一定義
-- =============================================================================

CREATE FUNCTION private.oauth_supported_scopes_v1()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'read:entries',
    'read:activities',
    'read:constraints',
    'read:stats',
    'write:plans',
    'delete:plans',
    'write:records',
    'delete:records'
  ]::TEXT[];
$$;

REVOKE ALL ON FUNCTION private.oauth_supported_scopes_v1()
  FROM PUBLIC, anon, authenticated, service_role;

-- =============================================================================
-- 2. CHECK 制約 3 本を単一定義参照へ差し替え
-- =============================================================================
-- cardinality(scopes) > 0 の条項はそのまま維持する。

ALTER TABLE public.oauth_connections
  DROP CONSTRAINT oauth_connections_scope_set,
  ADD CONSTRAINT oauth_connections_scope_set CHECK (
    cardinality(scopes) > 0
    AND scopes <@ private.oauth_supported_scopes_v1()
  );

ALTER TABLE public.oauth_tokens
  DROP CONSTRAINT oauth_tokens_supported_scopes_check,
  ADD CONSTRAINT oauth_tokens_supported_scopes_check CHECK (
    cardinality(scopes) > 0
    AND scopes <@ private.oauth_supported_scopes_v1()
  );

ALTER TABLE public.oauth_authorization_codes
  DROP CONSTRAINT oauth_authorization_codes_supported_scopes_check,
  ADD CONSTRAINT oauth_authorization_codes_supported_scopes_check CHECK (
    cardinality(scopes) > 0
    AND scopes <@ private.oauth_supported_scopes_v1()
  );

-- =============================================================================
-- 3. grant 関数本体を単一定義参照へ差し替え
-- =============================================================================
-- シグネチャ不変のため CREATE OR REPLACE（ACL は保持されるが、末尾で
-- REVOKE/GRANT を冪等に再宣言する既存の流儀を維持する）。
-- 変更点は allowlist 判定を `private.oauth_supported_scopes_v1()` 参照に
-- 差し替えるのみ。write scope 判定・read:entries 同伴チェックは不変。

CREATE OR REPLACE FUNCTION public.create_oauth_authorization_grant_v2(
  p_user_id UUID,
  p_client_id TEXT,
  p_resource_uri TEXT,
  p_scopes TEXT[],
  p_code_hash TEXT,
  p_redirect_uri TEXT,
  p_code_challenge TEXT,
  p_write_enabled BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_connection_id UUID;
  v_has_write_scope BOOLEAN;
  v_enabled_client_ids TEXT[];
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.require_mcp_environment_resource_v1(p_resource_uri);
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  IF p_client_id <> ALL (ARRAY['claude-ai', 'chatgpt', 'cursor']::TEXT[]) THEN
    RAISE EXCEPTION 'Invalid OAuth client'
      USING ERRCODE = '22023';
  END IF;

  IF cardinality(p_scopes) = 0
    OR NOT (p_scopes <@ private.oauth_supported_scopes_v1())
  THEN
    RAISE EXCEPTION 'Invalid OAuth scope set'
      USING ERRCODE = '22023';
  END IF;

  v_has_write_scope := p_scopes && ARRAY[
    'write:plans',
    'delete:plans',
    'write:records',
    'delete:records'
  ]::TEXT[];

  IF v_has_write_scope AND NOT ('read:entries' = ANY (p_scopes)) THEN
    RAISE EXCEPTION 'OAuth write scopes require read:entries'
      USING ERRCODE = '22023';
  END IF;

  IF v_has_write_scope AND p_write_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OAuth write scope is not enabled for this connection'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_has_write_scope AND p_write_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'OAuth read-only scope cannot enable writes'
      USING ERRCODE = '22023';
  END IF;

  IF v_has_write_scope THEN
    SELECT control.enabled_client_ids
    INTO v_enabled_client_ids
    FROM public.mcp_mutation_control AS control
    WHERE control.singleton_key = true
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MCP mutation control is missing'
        USING ERRCODE = 'DM002';
    END IF;

    IF NOT (p_client_id = ANY (v_enabled_client_ids)) THEN
      RAISE EXCEPTION 'MCP writes are disabled for this client'
        USING ERRCODE = 'DM003';
    END IF;
  END IF;

  INSERT INTO public.oauth_connections (
    user_id,
    client_id,
    resource_uri,
    scopes,
    write_enabled_at
  ) VALUES (
    p_user_id,
    p_client_id,
    p_resource_uri,
    p_scopes,
    CASE WHEN p_write_enabled THEN pg_catalog.now() ELSE NULL END
  )
  RETURNING id INTO v_connection_id;

  INSERT INTO public.oauth_authorization_codes (
    code_hash,
    user_id,
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    scopes,
    connection_id,
    resource_uri
  ) VALUES (
    p_code_hash,
    p_user_id,
    p_client_id,
    p_redirect_uri,
    p_code_challenge,
    'S256',
    p_scopes,
    v_connection_id,
    p_resource_uri
  );

  RETURN v_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_oauth_authorization_grant_v2(
  UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_oauth_authorization_grant_v2(
  UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, BOOLEAN
) TO service_role;

COMMIT;
