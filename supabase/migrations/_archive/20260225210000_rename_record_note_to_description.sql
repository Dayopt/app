-- records: note → description リネーム
-- record_activities: memo_changed → description_changed

-- カラムリネーム
ALTER TABLE records RENAME COLUMN note TO description;

-- record_activities CHECK制約の更新（memo_changed → description_changed）
ALTER TABLE record_activities DROP CONSTRAINT IF EXISTS record_activities_action_type_check;
ALTER TABLE record_activities ADD CONSTRAINT record_activities_action_type_check
  CHECK (action_type IN (
    'created', 'updated', 'time_changed',
    'title_changed', 'description_changed', 'fulfillment_changed',
    'tag_added', 'tag_removed',
    'deleted'
  ));

-- 既存データの移行
UPDATE record_activities SET action_type = 'description_changed' WHERE action_type = 'memo_changed';
