-- ============================================================
-- oauth_tokens の user UPDATE policy を削除
--
-- 経緯:
--   20260501000000 で UPDATE policy を `user_id = auth.uid()` で
--   付与したが、PostgreSQL RLS は column-level 制限ができないため
--   user 自身が token_hash / scopes / expires_at / parent_token_id まで
--   書き換えられる穴になっていた (codex review P1 指摘)。
--
--   Phase 1 で user-initiated revoke の UI / mutation も無いので、
--   user の UPDATE は完全に閉じる。Phase 1.5 で revoke を実装する際は
--   service-role で動く tRPC mutation 経由で UPDATE する。
--
-- See: docs/design/mcp-server/overview.md (Phase 1.5)
-- ============================================================

DROP POLICY IF EXISTS "Users can update own oauth_tokens" ON public.oauth_tokens;
