-- 優先度（priority）カラムを完全に削除
-- チケット管理からpriorityの概念を削除

-- 1. priorityカラムを削除
ALTER TABLE plans
DROP COLUMN IF EXISTS priority;

-- 2. activity の priority_changed アクション種別を削除
-- （既存のpriority_changedアクティビティは残すが、新規作成は不可）
ALTER TABLE plan_activities
DROP CONSTRAINT IF EXISTS plan_activities_action_type_check;

-- 新しいチェック制約（priority_changedを除外）
ALTER TABLE plan_activities
ADD CONSTRAINT plan_activities_action_type_check
CHECK (action_type IN (
  'created',
  'updated',
  'status_changed',
  'title_changed',
  'description_changed',
  'due_date_changed',
  'time_changed',
  'tag_added',
  'tag_removed',
  'deleted'
));
