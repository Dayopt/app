-- plan_activities: CHECK制約をZodスキーマと整合
-- priority_changed/due_date_changed を削除し、recurrence_changed/reminder_changed を追加
ALTER TABLE plan_activities DROP CONSTRAINT IF EXISTS plan_activities_action_type_check;
ALTER TABLE plan_activities ADD CONSTRAINT plan_activities_action_type_check
  CHECK (action_type IN (
    'created', 'updated', 'status_changed',
    'title_changed', 'description_changed', 'time_changed',
    'tag_added', 'tag_removed',
    'recurrence_changed', 'reminder_changed',
    'deleted'
  ));
