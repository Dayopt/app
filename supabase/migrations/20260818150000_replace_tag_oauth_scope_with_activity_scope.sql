-- MCP の OAuth scope を `read:tags` から `read:activities` へ置換する（#2174, Step 6）。
--
-- タグモデル全置換（#2162）で分類は activities / categories へ移るため、`read:tags`
-- が指す資源そのものが無くなる。alias は残さない: 2026-08-18 に production を
-- read-only で実測したところ、`read:tags` を持つ grant が 0 件であるだけでなく
-- oauth_connections / oauth_tokens / oauth_authorization_codes の 3 テーブルが
-- 全件 0 行だった（= 本番に接続したクライアントが 1 つも存在しない）。設計 §12-3 が
-- alias 維持を推奨した根拠は「その接続の MCP 呼び出しが全部 401 になる」ことだが、
-- 壊れる接続が 0 件なのでこの推奨は母数が空。User 裁可 c（実測 0 件なら alias なし
-- クリーン置換）の条件が成立している。
--
-- ★ scope の allowlist は 4 箇所に分かれている。1 箇所でも漏らすと壊れ方が非対称:
--     - CHECK 制約 3 本  … その値を「保存」してよいか
--     - grant 関数の本体 … その grant を「作成」してよいか（`<@` 包含判定）
--   CHECK だけ直して関数を直さないと、保存はできるのに新規接続が 22023 で失敗する。
--   逆に関数だけ直すと grant は作れるのに INSERT が 23514 で落ちる。本 migration は
--   4 箇所を同一トランザクションで動かす。契約は
--   apps/product/src/lib/test/integration/mcp-oauth-scope-allowlist.integration.test.ts が
--   TS の SUPPORTED_SCOPES を単一の期待値として 4 箇所すべてへ突き合わせる形で固定する。
--
-- ★ 本 migration は「置換」であって「追加」ではない。`read:tags` を allowlist から
--   外すため、万一 stored grant が残っていれば ADD CONSTRAINT の検証が失敗して
--   migration ごと止まる。これは意図した fail-safe（黙って壊れるより止まる）だが、
--   PostgreSQL の既定メッセージは行の所在を示さないので、先に read-only の preflight を
--   置いて件数だけを報告する（20260730090200 と同じ流儀。行の識別子はログへ出さない）。

BEGIN;

SET LOCAL lock_timeout = '5s';
-- ADD CONSTRAINT は 3 テーブルを全件走査する。実測時点では 0 行だが、走査すること
-- 自体は変わらないため NOT VALID 相当のメタデータ操作より広く取る。
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. Read-only preflight — `read:tags` を持つ stored grant が残っていないか
-- =============================================================================
-- 実測は 2026-08-18 時点のもので、この migration が production へ適用されるのは
-- それより後。実測と適用の間に `read:tags` の grant が発行される窓は理屈の上では
-- あるので、想定が崩れていたらここで止める。件数のみを報告し、user_id / client_id /
-- token_hash / code_hash / scopes の値は 1 つも出さない。

DO $$
DECLARE
  v_removed_scope CONSTANT TEXT[] := ARRAY['read:tags']::TEXT[];
  v_connection_violations BIGINT;
  v_authorization_code_violations BIGINT;
  v_token_violations BIGINT;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_connection_violations
  FROM public.oauth_connections
  WHERE scopes && v_removed_scope;

  SELECT pg_catalog.count(*)
  INTO v_authorization_code_violations
  FROM public.oauth_authorization_codes
  WHERE scopes && v_removed_scope;

  SELECT pg_catalog.count(*)
  INTO v_token_violations
  FROM public.oauth_tokens
  WHERE scopes && v_removed_scope;

  IF v_connection_violations > 0
    OR v_authorization_code_violations > 0
    OR v_token_violations > 0
  THEN
    RAISE EXCEPTION
      'read:tags grants still exist; clean replacement is unsafe (connections=%, authorization_codes=%, tokens=%)',
      v_connection_violations,
      v_authorization_code_violations,
      v_token_violations
      USING
        HINT = 'The 0-row measurement this migration relies on no longer holds. Re-decide alias vs clean replace before retrying.',
        ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- =============================================================================
-- 2. CHECK 制約 3 本（保存の allowlist）
-- =============================================================================
-- 既存制約の他の条項（cardinality > 0）はそのまま維持する。`read:tags` を
-- `read:activities` へ差し替える以外の変更を入れない。

ALTER TABLE public.oauth_connections
  DROP CONSTRAINT oauth_connections_scope_set,
  ADD CONSTRAINT oauth_connections_scope_set CHECK (
    cardinality(scopes) > 0
    AND scopes <@ ARRAY[
      'read:entries',
      'read:activities',
      'read:constraints',
      'read:stats',
      'write:plans',
      'delete:plans',
      'write:records',
      'delete:records'
    ]::TEXT[]
  );

ALTER TABLE public.oauth_tokens
  DROP CONSTRAINT oauth_tokens_supported_scopes_check,
  ADD CONSTRAINT oauth_tokens_supported_scopes_check CHECK (
    cardinality(scopes) > 0
    AND scopes <@ ARRAY[
      'read:entries',
      'read:activities',
      'read:constraints',
      'read:stats',
      'write:plans',
      'delete:plans',
      'write:records',
      'delete:records'
    ]::TEXT[]
  );

ALTER TABLE public.oauth_authorization_codes
  DROP CONSTRAINT oauth_authorization_codes_supported_scopes_check,
  ADD CONSTRAINT oauth_authorization_codes_supported_scopes_check CHECK (
    cardinality(scopes) > 0
    AND scopes <@ ARRAY[
      'read:entries',
      'read:activities',
      'read:constraints',
      'read:stats',
      'write:plans',
      'delete:plans',
      'write:records',
      'delete:records'
    ]::TEXT[]
  );

-- =============================================================================
-- 3. grant 関数本体の allowlist（作成の allowlist）
-- =============================================================================
-- シグネチャは不変なので `CREATE OR REPLACE`。設計 §9 が定める
-- 「厳密シグネチャ DROP → CREATE → GRANT/REVOKE 再適用」は引数を足す場合の規約で、
-- REPLACE では ACL が保持されるためここには当たらない（ACL 消失は DROP の副作用）。
-- ただし hardening 済みの権限が実際に保たれていることを migration 自身で
-- 明示するため、末尾で REVOKE / GRANT を再宣言する（冪等）。
--
-- 変更点は `p_scopes <@ ARRAY[...]` の 1 要素のみ。write scope が read:entries の
-- 同伴を要求する不変条件（TS 側 lib/mcp/auth.ts の parseStoredScopes と二重化）は
-- そのまま維持する。

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
    OR NOT (
      p_scopes <@ ARRAY[
        'read:entries',
        'read:activities',
        'read:constraints',
        'read:stats',
        'write:plans',
        'delete:plans',
        'write:records',
        'delete:records'
      ]::TEXT[]
    ) THEN
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
