-- actual_end_time >= actual_start_time を強制
-- actual_start_time カラムが存在する場合のみ追加
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entries' AND column_name = 'actual_start_time'
  ) THEN
    ALTER TABLE entries ADD CONSTRAINT entries_actual_time_order_check
      CHECK (
        actual_start_time IS NULL
        OR actual_end_time IS NULL
        OR actual_end_time >= actual_start_time
      );
  END IF;
END $$;

-- scheduled time も同様
ALTER TABLE entries ADD CONSTRAINT entries_scheduled_time_order_check
  CHECK (
    start_time IS NULL
    OR end_time IS NULL
    OR end_time >= start_time
  );
