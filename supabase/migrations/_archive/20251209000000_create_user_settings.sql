-- ユーザー設定テーブル
-- カレンダー設定やその他のユーザー固有設定をDB永続化

CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- タイムゾーン設定
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  show_utc_offset BOOLEAN NOT NULL DEFAULT true,

  -- 時間表示形式
  time_format TEXT NOT NULL DEFAULT '24h' CHECK (time_format IN ('24h', '12h')),

  -- 週の設定
  week_starts_on SMALLINT NOT NULL DEFAULT 1 CHECK (week_starts_on IN (0, 1, 6)),
  show_weekends BOOLEAN NOT NULL DEFAULT true,
  show_week_numbers BOOLEAN NOT NULL DEFAULT false,

  -- タスク設定
  default_duration INTEGER NOT NULL DEFAULT 60,
  snap_interval SMALLINT NOT NULL DEFAULT 15 CHECK (snap_interval IN (5, 10, 15, 30)),

  -- 営業時間
  business_hours_start SMALLINT NOT NULL DEFAULT 9 CHECK (business_hours_start >= 0 AND business_hours_start <= 23),
  business_hours_end SMALLINT NOT NULL DEFAULT 18 CHECK (business_hours_end >= 0 AND business_hours_end <= 23),

  -- 表示設定
  show_declined_events BOOLEAN NOT NULL DEFAULT false,

  -- クロノタイプ設定
  chronotype_enabled BOOLEAN NOT NULL DEFAULT true,
  chronotype_type TEXT NOT NULL DEFAULT 'bear' CHECK (chronotype_type IN ('bear', 'lion', 'wolf', 'dolphin', 'custom')),
  chronotype_custom_zones JSONB,
  chronotype_display_mode TEXT NOT NULL DEFAULT 'border' CHECK (chronotype_display_mode IN ('border', 'background', 'both')),
  chronotype_opacity SMALLINT NOT NULL DEFAULT 90 CHECK (chronotype_opacity >= 0 AND chronotype_opacity <= 100),

  -- Plan/Record表示設定
  plan_record_mode TEXT NOT NULL DEFAULT 'both' CHECK (plan_record_mode IN ('plan', 'record', 'both')),

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 1ユーザーにつき1レコード
  UNIQUE(user_id)
);

-- インデックス
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);

-- RLS有効化
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の設定のみアクセス可能
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON user_settings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_settings_updated_at();

-- コメント
COMMENT ON TABLE user_settings IS 'ユーザー固有の設定（カレンダー設定等）';
COMMENT ON COLUMN user_settings.timezone IS 'タイムゾーン（例: Asia/Tokyo）';
COMMENT ON COLUMN user_settings.chronotype_type IS 'クロノタイプ: bear, lion, wolf, dolphin, custom';
COMMENT ON COLUMN user_settings.plan_record_mode IS 'カレンダー表示モード: plan, record, both';
