-- COALESCE(actual_start_time, start_time) > COALESCE(actual_end_time, end_time) の
-- 全パターンを修正。制約追加で tstzrange の lower > upper エラーを防ぐ。

-- Case 1: actual_start のみ設定 → actual_start > end_time
-- actual_startを end_time に合わせる（実績開始が予定終了より後は不整合）
UPDATE public.entries
SET actual_start_time = NULL
WHERE actual_start_time IS NOT NULL
  AND actual_end_time IS NULL
  AND actual_start_time > end_time;

-- Case 2: actual_end のみ設定 → start_time > actual_end
-- actual_endを NULL にする（予定開始が実績終了より後は不整合）
UPDATE public.entries
SET actual_end_time = NULL
WHERE actual_start_time IS NULL
  AND actual_end_time IS NOT NULL
  AND start_time > actual_end_time;

-- Case 3: 両方設定だがスワップ後もまだ不整合（念のため）
UPDATE public.entries
SET
  actual_start_time = actual_end_time,
  actual_end_time = actual_start_time
WHERE actual_start_time IS NOT NULL
  AND actual_end_time IS NOT NULL
  AND actual_start_time > actual_end_time;

-- Case 4: start_time > end_time（ベースの不整合）
UPDATE public.entries
SET
  start_time = end_time,
  end_time = start_time
WHERE start_time IS NOT NULL
  AND end_time IS NOT NULL
  AND start_time > end_time;
