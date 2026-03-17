-- user_settingsテーブルにテーマ設定カラムを追加

-- テーマ設定（light, dark, system）
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system'
CHECK (theme IN ('light', 'dark', 'system'));

-- カラースキーム設定（blue, green, purple, orange, red）
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS color_scheme TEXT NOT NULL DEFAULT 'blue'
CHECK (color_scheme IN ('blue', 'green', 'purple', 'orange', 'red'));

-- コメント
COMMENT ON COLUMN user_settings.theme IS 'テーマ設定: light, dark, system';
COMMENT ON COLUMN user_settings.color_scheme IS 'カラースキーム: blue, green, purple, orange, red';
