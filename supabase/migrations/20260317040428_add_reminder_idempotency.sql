-- check-reminders Edge Function の冪等性保証
-- 通知作成と reminder_sent=true の間にクラッシュした場合の重複通知を防止

-- 同一エントリに対する同一タイプの通知は1つのみ
-- (entry_id IS NOT NULL の場合のみ適用 — entry_id=NULL の通知は複数可)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_entry_type_unique
  ON public.notifications (entry_id, type)
  WHERE entry_id IS NOT NULL;
