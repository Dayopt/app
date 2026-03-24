-- ============================================================
-- リマインダーをON/OFFトグルに簡素化
-- reminder_minutes: 0 (ON = 開始時に通知) or NULL (OFF = 通知なし)
-- ============================================================

-- 1. 既存の事前通知（5, 10, 15, 30, 60, 1440, 10080）をすべて「開始時」に変換
UPDATE entries SET reminder_minutes = 0 WHERE reminder_minutes > 0;

-- 2. 0 (ON) or NULL (OFF) のみ許可する制約を追加
ALTER TABLE entries ADD CONSTRAINT chk_reminder_minutes_toggle
  CHECK (reminder_minutes IS NULL OR reminder_minutes = 0);

-- 3. compute_reminder_at() を簡素化（事前通知計算の廃止）
CREATE OR REPLACE FUNCTION public.compute_reminder_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reminder_minutes IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    -- reminder_minutes = 0 → 開始時刻に通知
    NEW.reminder_at := NEW.start_time;
    NEW.reminder_sent := false;
  ELSE
    NEW.reminder_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. notification_preferences に default_reminder_enabled を追加
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS default_reminder_enabled BOOLEAN NOT NULL DEFAULT true;

-- 既存データ移行: default_reminder_minutes が NULL → false, それ以外 → true
UPDATE notification_preferences
  SET default_reminder_enabled = (default_reminder_minutes IS NOT NULL);
