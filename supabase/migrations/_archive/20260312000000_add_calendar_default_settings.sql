-- defaultView と hourHeightDensity をDB永続化
-- Settings（デフォルト値）とヘッダー（セッション値）の分離に必要

ALTER TABLE user_settings
  ADD COLUMN default_view TEXT NOT NULL DEFAULT 'week',
  ADD COLUMN hour_height_density TEXT NOT NULL DEFAULT 'default';
