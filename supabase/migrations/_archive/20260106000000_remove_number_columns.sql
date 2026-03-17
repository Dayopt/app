-- plan_number と tag_number カラムを削除
-- UUID のみで管理するためのマイグレーション

-- ========================================
-- 1. plans テーブルから plan_number を削除
-- ========================================

-- トリガーを削除
DROP TRIGGER IF EXISTS trigger_generate_plan_number ON plans;

-- 関数を削除
DROP FUNCTION IF EXISTS generate_simple_plan_number();
DROP FUNCTION IF EXISTS generate_simple_ticket_number();
DROP FUNCTION IF EXISTS generate_plan_number();

-- インデックスを削除
DROP INDEX IF EXISTS idx_plans_plan_number;

-- 制約を削除（ユニーク制約）
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_user_id_plan_number_key;
ALTER TABLE plans DROP CONSTRAINT IF EXISTS tickets_user_id_ticket_number_key;

-- カラムを削除
ALTER TABLE plans DROP COLUMN IF EXISTS plan_number;

-- ========================================
-- 2. tags テーブルから tag_number を削除
-- ========================================

-- トリガーを削除
DROP TRIGGER IF EXISTS trigger_set_tag_number ON tags;

-- 関数を削除
DROP FUNCTION IF EXISTS set_tag_number();
DROP FUNCTION IF EXISTS get_next_tag_number(UUID);

-- インデックスを削除
DROP INDEX IF EXISTS idx_tags_user_id_tag_number;

-- 制約を削除
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_user_id_tag_number_unique;

-- カラムを削除
ALTER TABLE tags DROP COLUMN IF EXISTS tag_number;

-- ========================================
-- 3. tag_groups テーブルから group_number を削除
-- ========================================

-- インデックスを削除
DROP INDEX IF EXISTS idx_tag_groups_user_group_number;

-- 制約を削除
ALTER TABLE tag_groups DROP CONSTRAINT IF EXISTS tag_groups_user_id_group_number_unique;
ALTER TABLE tag_groups DROP CONSTRAINT IF EXISTS tag_groups_user_id_group_number_key;

-- カラムを削除
ALTER TABLE tag_groups DROP COLUMN IF EXISTS group_number;

-- ========================================
-- 完了通知
-- ========================================
DO $$
BEGIN
  RAISE NOTICE 'Successfully removed plan_number, tag_number, and group_number columns. Now using UUID only.';
END $$;
