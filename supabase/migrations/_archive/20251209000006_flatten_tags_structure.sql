-- ========================================
-- タグ構造のフラット化クリーンアップ
-- 作成日: 2025-12-09
-- 目的: 階層構造からフラット構造への移行に伴い、不要なカラム・トリガー・インデックスを削除
-- ========================================

-- 1. トリガーを削除
DROP TRIGGER IF EXISTS tags_level_auto_calculate ON tags;
DROP TRIGGER IF EXISTS tags_path_auto_update ON tags;
DROP TRIGGER IF EXISTS tags_depth_auto_calculate ON tags;

-- 2. 関数を削除
DROP FUNCTION IF EXISTS calculate_tag_level();
DROP FUNCTION IF EXISTS update_tag_path();

-- 3. インデックスを削除
DROP INDEX IF EXISTS idx_tags_path;
DROP INDEX IF EXISTS idx_tags_level;
DROP INDEX IF EXISTS idx_tags_parent_id;

-- 4. 外部キー制約を削除（parent_id の自己参照）
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_parent_id_fkey;

-- 5. カラムを削除
ALTER TABLE tags DROP COLUMN IF EXISTS parent_id;
ALTER TABLE tags DROP COLUMN IF EXISTS level;
ALTER TABLE tags DROP COLUMN IF EXISTS depth;
ALTER TABLE tags DROP COLUMN IF EXISTS path;

-- 6. コメント追加
COMMENT ON TABLE tags IS 'タグテーブル（フラット構造: グループ → タグの2階層）';
COMMENT ON COLUMN tags.group_id IS 'タググループID（タグの分類に使用）';
