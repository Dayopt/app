-- タグにLucideアイコン名フィールドを追加
-- NULL = 従来の色ドットにフォールバック
ALTER TABLE tags ADD COLUMN icon TEXT DEFAULT NULL;
COMMENT ON COLUMN tags.icon IS 'Lucide icon name (e.g. "briefcase", "code"). NULL = color dot fallback';
