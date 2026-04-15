-- ============================================================
-- user_settings から date_format を削除
-- preferred_locale から自動導出する（ja→yyyy/MM/dd, en→MM/dd/yyyy）
-- ============================================================

ALTER TABLE user_settings DROP COLUMN date_format;
