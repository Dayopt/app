-- ============================================================
-- user_settings から show_utc_offset を削除
-- UIで参照されておらず不要
-- ============================================================

ALTER TABLE user_settings DROP COLUMN show_utc_offset;
