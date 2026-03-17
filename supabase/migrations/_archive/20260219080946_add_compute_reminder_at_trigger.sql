-- reminder_at を自動計算するトリガー関数
CREATE OR REPLACE FUNCTION public.compute_reminder_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reminder_minutes IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    NEW.reminder_at := NEW.start_time - (NEW.reminder_minutes * INTERVAL '1 minute');
    NEW.reminder_sent := false;
  ELSE
    NEW.reminder_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- INSERT/UPDATE トリガー
DROP TRIGGER IF EXISTS trg_compute_reminder_at ON plans;
CREATE TRIGGER trg_compute_reminder_at
  BEFORE INSERT OR UPDATE OF reminder_minutes, start_time
  ON plans
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_reminder_at();

-- 既存データのバックフィル
UPDATE plans
SET reminder_at = start_time - (reminder_minutes * INTERVAL '1 minute'),
    reminder_sent = false
WHERE reminder_minutes IS NOT NULL
  AND start_time IS NOT NULL
  AND reminder_at IS NULL;
