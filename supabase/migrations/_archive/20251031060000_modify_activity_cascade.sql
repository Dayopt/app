-- アクティビティを履歴として保持するため、CASCADE を SET NULL に変更
-- これにより、チケット削除後もアクティビティ履歴が残る

-- 既存の外部キー制約を削除
ALTER TABLE plan_activities
DROP CONSTRAINT IF EXISTS plan_activities_plan_id_fkey;

-- SET NULL で外部キー制約を再作成
ALTER TABLE plan_activities
ADD CONSTRAINT plan_activities_plan_id_fkey
FOREIGN KEY (plan_id)
REFERENCES plans(id)
ON DELETE SET NULL;

-- plan_id カラムを nullable に変更（すでに nullable なので確認のみ）
-- plan_activities テーブル作成時に plan_id は NOT NULL で定義されているため変更が必要
ALTER TABLE plan_activities
ALTER COLUMN plan_id DROP NOT NULL;
