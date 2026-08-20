-- 20260820100000 で `private.oauth_supported_scopes_v1()` を作成した際、
-- `private.require_mcp_environment_resource_v1` と同じ REVOKE ALL パターンを
-- そのまま適用したが、その前提（「oauth_tokens 等は直接 INSERT されず RPC
-- 経由。owner 権限で実行されるため REVOKE ALL でも動く」）は UPDATE 経路に
-- ついて誤りだった（risk-reviewer の反証レビューで検出）。
--
-- `apps/product/src/lib/mcp/auth.ts` の `updateUsageTimestamps()` が
-- oauth_tokens / oauth_connections の `last_used_at` を service_role で
-- 直接 UPDATE している（PostgREST 経由、RPC を経由しない）。PostgreSQL は
-- UPDATE のたびに対象テーブルの CHECK 制約を全カラム再評価し、制約式の中で
-- 呼ばれる関数は constraint の owner ではなく **実行中のロール**（この場合
-- service_role）で EXECUTE 権限をチェックする。そのため REVOKE ALL のままだと
-- 上記の直接 UPDATE が `permission denied for function
-- oauth_supported_scopes_v1`（42501）で失敗する。ローカル DB で実測確認済み。
--
-- 返す配列は server metadata（`.well-known` 等）で既に公開している scope
-- allowlist そのものなので、service_role へ EXECUTE を渡しても情報漏洩には
-- ならない。anon / authenticated は revoke されたまま（この 2 ロールが
-- oauth_tokens / oauth_authorization_codes へ書き込む経路は存在しない）。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5s';

GRANT EXECUTE ON FUNCTION private.oauth_supported_scopes_v1() TO service_role;

COMMIT;
