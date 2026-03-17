-- ========================================
-- tag_number カラムにデフォルト値を設定
-- トリガーで自動設定されるが、型定義上必須になるのを防ぐ
-- ========================================

ALTER TABLE tags ALTER COLUMN tag_number SET DEFAULT 0;

-- コメント追加
COMMENT ON COLUMN tags.tag_number IS 'タグ番号（ユーザーごとの連番）。トリガーで自動設定される。';
