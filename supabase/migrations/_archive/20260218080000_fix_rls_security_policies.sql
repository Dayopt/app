-- =============================================================
-- RLSポリシーのセキュリティ修正
--
-- 修正内容:
-- 1. login_attempts: anon/authenticated の SELECT を削除
--    → ユーザー列挙攻撃（メール登録有無の推測）を防止
--    → 本番コードで client-side SELECT は使用していない
-- 2. notification_preferences: INSERT の WITH CHECK を修正
--    → auth.uid() = user_id チェックを追加
-- 3. notifications: INSERT の roles を service_role に制限
--    → 未認証ユーザーからの通知作成を防止
-- =============================================================

-- 1. login_attempts: SELECT を service_role のみに制限
DROP POLICY IF EXISTS "Anyone can check login attempts by email" ON login_attempts;
-- service_role は既存の "Service role has full access to login_attempts" ポリシーで
-- 全操作が許可されているため、追加のSELECTポリシーは不要

-- 2. notification_preferences: INSERT に user_id 一致チェックを追加
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON notification_preferences;
CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. notifications: INSERT を service_role のみに制限
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "System can create notifications"
  ON notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);
