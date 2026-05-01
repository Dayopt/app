-- ============================================================
-- RLS ポリシー一覧（読み物用 — CLIでは使用しない）
-- ============================================================
-- 全ユーザーデータテーブルで RLS が有効
--
-- パターン:
--   (select auth.uid()) でキャッシュ → auth.uid() 直呼びより 94-99% 高速
-- ============================================================

-- ■ profiles: id = auth.uid()
-- ■ entries: user_id = auth.uid()
-- ■ tags: user_id = auth.uid()
-- ■ entry_tags: user_id = auth.uid()
-- ■ user_settings: user_id = auth.uid()

-- ■ mfa_recovery_codes: SELECT/INSERT/DELETE は user_id = auth.uid()、UPDATE不可
-- ■ reports: SELECT/DELETE は user_id = auth.uid()、INSERT は service_role のみ
-- ■ oauth_tokens: SELECT のみ user_id = auth.uid()、UPDATE/INSERT/DELETE は service-role のみ
--   (column-level RLS が無いため user UPDATE は閉じている。revoke は service-role 経由)
-- ■ oauth_authorization_codes: 全 user-facing policy 無し (service-role のみ)

-- 詳細は baseline.sql の RLS Policies セクションを参照
