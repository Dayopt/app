-- タグテーブルにis_activeカラムを追加
-- アーカイブ機能のために必要

ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN tags.is_active IS 'タグがアクティブかどうか（false = アーカイブ済み）';
