-- plan_instances: JSONB overrides を型付きカラムに移行
-- Google Calendar 方式: インスタンスは親イベントと同じ型付きフィールドを持つ

-- 1. 型付きカラムを追加
ALTER TABLE plan_instances ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE plan_instances ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. 既存 JSONB データを型付きカラムへ移行
UPDATE plan_instances SET
  title = overrides->>'title',
  description = overrides->>'description',
  instance_start = CASE WHEN overrides->>'start_time' IS NOT NULL
    THEN (overrides->>'start_time')::TIMESTAMPTZ ELSE instance_start END,
  instance_end = CASE WHEN overrides->>'end_time' IS NOT NULL
    THEN (overrides->>'end_time')::TIMESTAMPTZ ELSE instance_end END
WHERE overrides IS NOT NULL AND overrides != '{}'::JSONB;

-- 3. 不要カラムを削除
ALTER TABLE plan_instances DROP COLUMN IF EXISTS overrides;
ALTER TABLE plan_instances DROP COLUMN IF EXISTS is_exception;

-- 4. 不要インデックスを削除
DROP INDEX IF EXISTS idx_plan_instances_is_exception;
