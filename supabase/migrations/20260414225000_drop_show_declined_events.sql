-- ============================================================
-- user_settings から show_declined_events を削除
-- Dayoptに共有カレンダー・招待機能がないため「decline」の概念が存在しない
-- ============================================================

ALTER TABLE user_settings DROP COLUMN show_declined_events;
