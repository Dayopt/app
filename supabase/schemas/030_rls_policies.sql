-- ============================================================
-- RLS ポリシー一覧（読み物用 — CLIでは使用しない）
-- ============================================================
-- 全ユーザーデータテーブルで RLS が有効
--
-- パターン:
--   (select auth.uid()) でキャッシュ → auth.uid() 直呼びより 94-99% 高速
--   service_role は通知作成のみ
-- ============================================================

-- ■ profiles: id = auth.uid()
-- ■ entries: user_id = auth.uid()
-- ■ tags: user_id = auth.uid()
-- ■ entry_tags: user_id = auth.uid()
-- ■ user_settings: user_id = auth.uid()

-- ■ notifications: SELECT/UPDATE/DELETE は user_id = auth.uid()、INSERT は service_role のみ
-- ■ mfa_recovery_codes: SELECT/INSERT/DELETE は user_id = auth.uid()、UPDATE不可
-- ■ reports: SELECT/DELETE は user_id = auth.uid()、INSERT は service_role のみ
-- ■ api_keys: SELECT/INSERT/DELETE は user_id = auth.uid()、UPDATE不可

-- 詳細は baseline.sql の RLS Policies セクションを参照
