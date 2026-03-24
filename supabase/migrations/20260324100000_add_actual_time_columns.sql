-- entries テーブルに actual_start_time / actual_end_time カラムを追加
-- 記録時間（実績）の永続化に必要

ALTER TABLE entries
  ADD COLUMN actual_start_time TIMESTAMPTZ,
  ADD COLUMN actual_end_time   TIMESTAMPTZ;

-- actual_end_time >= actual_start_time を強制
ALTER TABLE entries ADD CONSTRAINT entries_actual_time_order_check
  CHECK (
    actual_start_time IS NULL
    OR actual_end_time IS NULL
    OR actual_end_time >= actual_start_time
  );
