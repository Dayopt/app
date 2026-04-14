-- ============================================================
-- 20260414105000 が途中失敗しカラムDROPが未適用だったため再実行
-- reminder_*, reviewed_at, backed_up_* を冪等に削除
-- ============================================================

-- 依存オブジェクトを先に削除（冪等）
DROP TRIGGER IF EXISTS trg_compute_reminder_at ON public.entries;
DROP FUNCTION IF EXISTS public.compute_reminder_at();
DROP INDEX IF EXISTS public.idx_plans_reminder_at_sent;
DROP INDEX IF EXISTS public.idx_entries_reviewed_at;
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS chk_reminder_minutes_toggle;

-- 不要カラムを削除
ALTER TABLE public.entries
  DROP COLUMN IF EXISTS reminder_minutes,
  DROP COLUMN IF EXISTS reminder_at,
  DROP COLUMN IF EXISTS reminder_sent,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS backed_up_start_time,
  DROP COLUMN IF EXISTS backed_up_end_time;
