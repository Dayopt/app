-- タグのiconカラムを削除（常にnull、UI未使用）
ALTER TABLE tags DROP COLUMN IF EXISTS icon;
