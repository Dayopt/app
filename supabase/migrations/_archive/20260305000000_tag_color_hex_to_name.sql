-- ==================================================================
-- タグカラー名マイグレーション
--
-- HEX文字列（'#3B82F6'等）→ カラー名（'blue'等）に変換
-- cyan → teal にリネーム（パレット統廃合）
-- ==================================================================

-- 既存HEXをカラー名に変換（大文字小文字両対応）
UPDATE tags
SET color = CASE lower(color)
  WHEN '#3b82f6' THEN 'blue'
  WHEN '#10b981' THEN 'green'
  WHEN '#ef4444' THEN 'red'
  WHEN '#f59e0b' THEN 'amber'
  WHEN '#8b5cf6' THEN 'violet'
  WHEN '#ec4899' THEN 'pink'
  WHEN '#06b6d4' THEN 'teal'
  WHEN '#f97316' THEN 'orange'
  WHEN '#6b7280' THEN 'gray'
  WHEN '#6366f1' THEN 'indigo'
  -- 既にカラー名の場合はそのまま（再実行安全）
  WHEN 'red'    THEN 'red'
  WHEN 'orange' THEN 'orange'
  WHEN 'amber'  THEN 'amber'
  WHEN 'green'  THEN 'green'
  WHEN 'teal'   THEN 'teal'
  WHEN 'cyan'   THEN 'teal'
  WHEN 'blue'   THEN 'blue'
  WHEN 'indigo' THEN 'indigo'
  WHEN 'violet' THEN 'violet'
  WHEN 'pink'   THEN 'pink'
  WHEN 'gray'   THEN 'gray'
  -- 未知の値 → デフォルト
  ELSE 'blue'
END
WHERE color IS NOT NULL;

-- CHECK制約を追加（無効な値をブロック）
ALTER TABLE tags
  ADD CONSTRAINT tags_color_valid_name
  CHECK (color IS NULL OR color IN (
    'red', 'orange', 'amber', 'green', 'teal',
    'blue', 'indigo', 'violet', 'pink', 'gray'
  ));

COMMENT ON COLUMN tags.color IS
  'タグカラー名。有効値: red, orange, amber, green, teal, blue, indigo, violet, pink, gray';
