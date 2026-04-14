-- 時間重複制約をstart_time/end_timeのみで再定義
-- actual時間はユーザーが自由に記録できるため制約対象外とする
-- 20260408100000 のCOALESCE版はstagingで既存データと競合したためスキップ済み

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_no_time_overlap;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_no_time_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (start_time IS NOT NULL AND end_time IS NOT NULL AND deleted_at IS NULL);
