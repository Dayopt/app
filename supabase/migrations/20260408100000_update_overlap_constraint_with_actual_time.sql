-- 時間重複制約を actual 時間を考慮した形に更新
-- 実績時間が記録されている場合、実質的な占有範囲として actual 時間を使用する。
-- これにより「予定9:00-10:00、実績9:00-9:45」のエントリの 9:45-10:00 に
-- 新しいエントリを配置できるようになる。

-- 既存の制約を削除
ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_no_time_overlap;

-- actual 時間を考慮した新しい制約
-- COALESCE(actual_start_time, start_time): 実績開始があればそちらを使用
-- COALESCE(actual_end_time, end_time): 実績終了があればそちらを使用
ALTER TABLE public.entries
  ADD CONSTRAINT entries_no_time_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(
      COALESCE(actual_start_time, start_time),
      COALESCE(actual_end_time, end_time)
    ) WITH &&
  )
  WHERE (start_time IS NOT NULL AND end_time IS NOT NULL);
