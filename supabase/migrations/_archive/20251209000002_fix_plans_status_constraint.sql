-- plansテーブルのstatus制約を修正
-- 問題: tickets_status_checkとplans_status_checkが競合している

-- 1. 古い制約を削除
ALTER TABLE plans DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_status_check;

-- 2. デフォルト値を'todo'に修正
ALTER TABLE plans ALTER COLUMN status SET DEFAULT 'todo';

-- 3. 新しい制約を追加（todo, doing, doneのみ許可）
ALTER TABLE plans ADD CONSTRAINT plans_status_check
  CHECK (status IN ('todo', 'doing', 'done'));

-- 4. 既存データで'open'やその他のステータスがあれば'todo'に更新
UPDATE plans
SET status = 'todo'
WHERE status NOT IN ('todo', 'doing', 'done');

COMMENT ON CONSTRAINT plans_status_check ON plans IS 'Plan status: todo, doing, done';
