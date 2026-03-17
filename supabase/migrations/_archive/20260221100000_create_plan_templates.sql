-- Plan Templates: テンプレートからプランを素早く作成するための機能
-- plan_tags の中間テーブルパターンを踏襲

-- ========================================
-- plan_templates テーブル
-- ========================================
CREATE TABLE plan_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  title_pattern VARCHAR(200) NOT NULL,
  plan_description TEXT,
  duration_minutes INTEGER CHECK (duration_minutes > 0),
  reminder_minutes INTEGER CHECK (reminder_minutes >= 0),
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================
-- plan_template_tags 中間テーブル
-- ========================================
CREATE TABLE plan_template_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES plan_templates(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(template_id, tag_id)
);

-- ========================================
-- インデックス
-- ========================================
CREATE INDEX idx_plan_templates_user_id ON plan_templates(user_id);
CREATE INDEX idx_plan_templates_use_count ON plan_templates(user_id, use_count DESC);
CREATE INDEX idx_plan_template_tags_template_id ON plan_template_tags(template_id);
CREATE INDEX idx_plan_template_tags_tag_id ON plan_template_tags(tag_id);

-- ========================================
-- updated_at 自動更新トリガー
-- ========================================
CREATE OR REPLACE FUNCTION update_plan_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

CREATE TRIGGER set_plan_templates_updated_at
  BEFORE UPDATE ON plan_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_plan_templates_updated_at();

-- ========================================
-- RLS ポリシー
-- ========================================
ALTER TABLE plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_template_tags ENABLE ROW LEVEL SECURITY;

-- plan_templates: ユーザーは自分のテンプレートのみ操作可能
CREATE POLICY "Users can view own plan_templates"
  ON plan_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plan_templates"
  ON plan_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own plan_templates"
  ON plan_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own plan_templates"
  ON plan_templates FOR DELETE
  USING (auth.uid() = user_id);

-- plan_template_tags: ユーザーは自分のテンプレートタグのみ操作可能
CREATE POLICY "Users can view own plan_template_tags"
  ON plan_template_tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own plan_template_tags"
  ON plan_template_tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own plan_template_tags"
  ON plan_template_tags FOR DELETE
  USING (auth.uid() = user_id);
