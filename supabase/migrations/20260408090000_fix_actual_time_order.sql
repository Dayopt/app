-- actual_start_time > actual_end_time の不整合データを修正
-- 制約追加前にスワップしておく
UPDATE public.entries
SET
  actual_start_time = actual_end_time,
  actual_end_time = actual_start_time
WHERE actual_start_time IS NOT NULL
  AND actual_end_time IS NOT NULL
  AND actual_start_time > actual_end_time;
