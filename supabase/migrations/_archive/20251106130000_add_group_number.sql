-- ========================================
-- Add group_number to tag_groups
-- 作成日: 2025-11-06
-- 目的: グループに番号形式のID (g-1, g-2, ...) を追加
-- ========================================

-- 1. group_number カラムを追加
ALTER TABLE tag_groups ADD COLUMN IF NOT EXISTS group_number SERIAL;

-- 2. group_number用のインデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_groups_user_group_number ON tag_groups(user_id, group_number);

-- 3. 既存データに group_number を割り当て
-- ユーザーごとに created_at 順で番号を振る
WITH numbered_groups AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as new_number
  FROM tag_groups
  WHERE group_number IS NULL
)
UPDATE tag_groups
SET group_number = numbered_groups.new_number
FROM numbered_groups
WHERE tag_groups.id = numbered_groups.id;

-- 4. group_number を NOT NULL に変更
ALTER TABLE tag_groups ALTER COLUMN group_number SET NOT NULL;
