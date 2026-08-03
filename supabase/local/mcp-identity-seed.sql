-- ============================================================
-- MCP environment identity（ローカル開発専用 seed）
-- ============================================================
-- OAuth token 発行前の assertDatabaseOAuthIdentity は
-- public.mcp_environment_identity の singleton 行と deployment の
-- identity tuple の一致を要求する（fail-closed）。ローカル開発は
-- MCP_OAUTH_ENVIRONMENT 未設定 = production identity で動くため、
-- production tuple（app.dayopt.app / mcp.dayopt.app / ref NULL）を入れる。
--
-- このファイルは supabase/seed.sql / migrations には含めない。
-- seed.sql は Supabase Preview Branch でも実行され、Preview の identity は
-- provision_mcp_preview_environment_identity_v1 が後から bind する契約の
-- ため、hosted で行を入れると provisioning が DI002 で壊れる。
-- 適用経路は `pnpm db:seed:identity`（db:fresh に含まれる）だけで、
-- 接続先が 127.0.0.1:54322 に固定されているため hosted では実行できない。
--
-- `supabase db reset` を単体で実行した後は identity が 0 行に戻る（正しい
-- 期待値）。ローカルで OAuth token 発行を使う場合は `pnpm db:seed:identity`
-- を実行する。

INSERT INTO public.mcp_environment_identity (
  singleton_key,
  environment,
  authorization_server_uri,
  resource_uri
) VALUES (
  true,
  'production',
  'https://app.dayopt.app',
  'https://mcp.dayopt.app'
)
ON CONFLICT (singleton_key) DO NOTHING;

\echo 'MCP environment identity (local production tuple) seeded. bare `supabase db reset` 後は `pnpm db:seed:identity` を再実行する。'
