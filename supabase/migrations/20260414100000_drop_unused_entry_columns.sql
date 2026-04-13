-- ============================================================
-- entries テーブルから不要カラムを削除
-- 1. reminder_minutes / reminder_at / reminder_sent — 独立関心事、PH前に不要
-- 2. reviewed_at — fulfillment_score IS NOT NULL で代替
-- 3. backed_up_start_time / backed_up_end_time — 未使用
-- 4. duration_minutes → GENERATED ALWAYS AS に変換
-- ============================================================

-- 1. リマインダー関連オブジェクトを DROP
DROP TRIGGER IF EXISTS trg_compute_reminder_at ON public.entries;
DROP FUNCTION IF EXISTS public.compute_reminder_at();
DROP INDEX IF EXISTS public.idx_plans_reminder_at_sent;

-- 2. reviewed_at インデックスを DROP
DROP INDEX IF EXISTS public.idx_entries_reviewed_at;

-- 3. 制約を DROP
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS chk_reminder_minutes_toggle;

-- 4. entries から不要カラムを DROP
ALTER TABLE public.entries
  DROP COLUMN IF EXISTS reminder_minutes,
  DROP COLUMN IF EXISTS reminder_at,
  DROP COLUMN IF EXISTS reminder_sent,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS backed_up_start_time,
  DROP COLUMN IF EXISTS backed_up_end_time;

-- 5. duration_minutes を GENERATED ALWAYS AS に変換
ALTER TABLE public.entries DROP COLUMN IF EXISTS duration_minutes;
ALTER TABLE public.entries
  ADD COLUMN duration_minutes INTEGER
  GENERATED ALWAYS AS (
    CASE
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL
      THEN EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER / 60
      ELSE NULL
    END
  ) STORED;

-- 6. notification_preferences の不要カラムを DROP
ALTER TABLE public.notification_preferences
  DROP COLUMN IF EXISTS default_reminder_minutes;

-- 7. get_timeboxing_adherence を更新
--    reviewed_at IS NOT NULL → fulfillment_score IS NOT NULL
--    duration_minutes OR (start/end) → start/end のみ（generated columnで等価）
CREATE OR REPLACE FUNCTION public.get_timeboxing_adherence(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_reviewed BIGINT;
  v_on_time BIGINT;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.entries
  WHERE user_id = p_user_id
    AND origin = 'planned'
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ;

  SELECT COUNT(*) INTO v_reviewed
  FROM public.entries
  WHERE user_id = p_user_id
    AND origin = 'planned'
    AND fulfillment_score IS NOT NULL
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ;

  SELECT COUNT(*) INTO v_on_time
  FROM public.entries
  WHERE user_id = p_user_id
    AND origin = 'planned'
    AND fulfillment_score IS NOT NULL
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL;

  RETURN json_build_object(
    'total_planned', v_total,
    'reviewed', v_reviewed,
    'on_time', v_on_time,
    'adherence_rate', CASE WHEN v_total > 0 THEN ROUND((v_reviewed::numeric / v_total) * 100, 1) ELSE 0 END
  );
END;
$$;
