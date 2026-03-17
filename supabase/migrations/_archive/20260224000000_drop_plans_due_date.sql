-- plans テーブルから未使用の due_date カラムを削除
-- タイムボクシング（start_time/end_time）に移行済みで、実データの使用率0%

-- インデックスを先に削除
DROP INDEX IF EXISTS idx_plans_due_date;

-- カラムを削除
ALTER TABLE plans DROP COLUMN IF EXISTS due_date;

-- plan_activities の CHECK制約から due_date_changed を除外
ALTER TABLE plan_activities DROP CONSTRAINT IF EXISTS plan_activities_action_type_check;
ALTER TABLE plan_activities ADD CONSTRAINT plan_activities_action_type_check
  CHECK (action_type IN ('created', 'updated', 'status_changed', 'title_changed',
    'description_changed', 'time_changed', 'tag_added', 'tag_removed', 'deleted'));
