-- ============================================================
-- user_settings から business_hours_start/end を削除
-- デフォルト9-18で固定。PMF後に再検討
-- ============================================================

ALTER TABLE user_settings DROP COLUMN business_hours_start;
ALTER TABLE user_settings DROP COLUMN business_hours_end;
