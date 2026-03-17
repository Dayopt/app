-- ========================================
-- fix_notification_preferences_rls.sql
-- 作成日: 2025-11-20
-- 目的: notification_preferences のRLSポリシーを修正し、SECURITY DEFINERトリガーからのINSERTを許可
-- ========================================

-- 既存のINSERTポリシーを削除
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON notification_preferences;

-- 新しいINSERTポリシーを作成（SECURITY DEFINER 関数からのINSERTを許可）
CREATE POLICY "Users can insert own notification preferences"
ON notification_preferences
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (true);

-- 注意: この変更により、SECURITY DEFINER 関数（create_default_notification_preferences）が
-- 認証状態に関係なく notification_preferences テーブルに挿入できるようになります。
-- セキュリティは create_default_notification_preferences() 関数の実装に依存します。
