-- ========================================
-- Tags テーブルスキーマ更新
-- 作成日: 2025-11-05
-- 目的: API仕様に合わせてtagsテーブルを更新
-- ========================================

-- 1. 新しいカラムを追加
ALTER TABLE tags ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS path TEXT;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS level SMALLINT DEFAULT 0;

-- 2. depthからlevelへデータを移行（depth - 1 = level、depth: 1-3 → level: 0-2）
UPDATE tags SET level = COALESCE(depth, 1) - 1 WHERE level IS NULL;

-- 3. pathの初期値を設定（既存データ用）
-- ルートタグ（parent_id IS NULL）の場合
UPDATE tags
SET path = '#' || name
WHERE parent_id IS NULL AND (path IS NULL OR path = '');

-- 子タグの場合（親タグのpathを使用）
WITH RECURSIVE tag_paths AS (
  -- ルートタグ
  SELECT id, name, parent_id, '#' || name as calculated_path, 0 as tag_level
  FROM tags
  WHERE parent_id IS NULL

  UNION ALL

  -- 子タグ（親のpathに自分のnameを追加）
  SELECT t.id, t.name, t.parent_id, tp.calculated_path || '/' || t.name, tp.tag_level + 1
  FROM tags t
  INNER JOIN tag_paths tp ON t.parent_id = tp.id
)
UPDATE tags
SET path = tag_paths.calculated_path
FROM tag_paths
WHERE tags.id = tag_paths.id AND (tags.path IS NULL OR tags.path = '');

-- 4. インデックスを追加
CREATE INDEX IF NOT EXISTS idx_tags_path ON tags(path);
CREATE INDEX IF NOT EXISTS idx_tags_is_active ON tags(is_active);
CREATE INDEX IF NOT EXISTS idx_tags_level ON tags(level);

-- 5. levelを自動計算するトリガーを更新（depthと同期）
CREATE OR REPLACE FUNCTION calculate_tag_level()
RETURNS TRIGGER AS $$
DECLARE
  calculated_level SMALLINT;
BEGIN
  -- parent_id が NULL の場合は level = 0（ルートタグ）
  IF NEW.parent_id IS NULL THEN
    NEW.level := 0;
    NEW.depth := 1;
  ELSE
    -- 親タグの level + 1 を計算
    SELECT COALESCE(level, 0) + 1 INTO calculated_level
    FROM tags
    WHERE id = NEW.parent_id;

    NEW.level := calculated_level;
    NEW.depth := calculated_level + 1;
  END IF;

  -- level が 3 以上（depth 4以上）の場合はエラー
  IF (NEW.level >= 2) THEN
    RAISE EXCEPTION 'Tag level cannot be 2 or greater (max 1: Group -> Tag only)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. 既存のdepthトリガーを置き換え
DROP TRIGGER IF EXISTS tags_depth_auto_calculate ON tags;
CREATE TRIGGER tags_level_auto_calculate
  BEFORE INSERT OR UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION calculate_tag_level();

-- 7. pathを自動更新するトリガーを追加
CREATE OR REPLACE FUNCTION update_tag_path()
RETURNS TRIGGER AS $$
DECLARE
  parent_path TEXT;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := '#' || NEW.name;
  ELSE
    SELECT path INTO parent_path FROM tags WHERE id = NEW.parent_id;
    NEW.path := parent_path || '/' || NEW.name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tags_path_auto_update
  BEFORE INSERT OR UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION update_tag_path();

-- 8. NOT NULL制約を追加（既存データの更新後）
ALTER TABLE tags ALTER COLUMN level SET NOT NULL;
ALTER TABLE tags ALTER COLUMN is_active SET NOT NULL;
