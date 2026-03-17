-- ========================================
-- plan & Session Management System
-- 作成日: 2024-10-27
-- Phase 1: Database Foundation
-- ========================================

-- ========================================
-- 1. Tags テーブル（既存テーブルを拡張）
-- ========================================
-- 既存のtagsテーブルにuser_idカラムを追加
ALTER TABLE tags ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- user_idのデフォルト値を設定（既存データ対応）
-- 注意: 既存データがある場合は手動でuser_idを設定する必要があります
-- UPDATE tags SET user_id = (SELECT id FROM auth.users LIMIT 1) WHERE user_id IS NULL;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- 既存のRLSポリシーを削除して新しいものを作成
DROP POLICY IF EXISTS "individual_access" ON tags;

-- 新しいRLSポリシー（user_idベース）を即座に作成
CREATE POLICY "Users can view own tags" ON tags FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can insert own tags" ON tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tags" ON tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tags" ON tags FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- 2. plans テーブル
-- ========================================
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_number TEXT NOT NULL,  -- 自動採番（TKT-20241027-001）
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  planned_hours DECIMAL(5,2),  -- 予定時間
  actual_hours DECIMAL(5,2) DEFAULT 0,  -- 実績時間（自動集計）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, plan_number)
);

CREATE INDEX idx_plans_user_id ON plans(user_id);
CREATE INDEX idx_plans_status ON plans(status);
CREATE INDEX idx_plans_plan_number ON plans(plan_number);

-- ========================================
-- 3. Sessions テーブル
-- ========================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  session_number TEXT NOT NULL,  -- 自動採番（SES-20241027-001）
  title TEXT NOT NULL,
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  duration_minutes INTEGER,  -- 実績時間（分）自動計算
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, session_number)
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_plan_id ON sessions(plan_id);
CREATE INDEX idx_sessions_status ON sessions(status);

-- ========================================
-- 4. Records テーブル（将来拡張用）
-- ========================================
CREATE TABLE records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_records_user_id ON records(user_id);
CREATE INDEX idx_records_session_id ON records(session_id);

-- ========================================
-- 5. タグ関連付けテーブル
-- ========================================
CREATE TABLE plan_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(plan_id, tag_id)
);

CREATE TABLE session_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_id, tag_id)
);

CREATE INDEX idx_plan_tags_plan_id ON plan_tags(plan_id);
CREATE INDEX idx_plan_tags_tag_id ON plan_tags(tag_id);
CREATE INDEX idx_session_tags_session_id ON session_tags(session_id);
CREATE INDEX idx_session_tags_tag_id ON session_tags(tag_id);

-- ========================================
-- 6. 自動採番関数
-- ========================================
CREATE OR REPLACE FUNCTION generate_plan_number()
RETURNS TRIGGER AS $$
DECLARE
  date_str TEXT;
  seq_num INTEGER;
  new_number TEXT;
BEGIN
  date_str := TO_CHAR(NOW(), 'YYYYMMDD');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(plan_number FROM 'TKT-[0-9]{8}-([0-9]+)') AS INTEGER)
  ), 0) + 1 INTO seq_num
  FROM plans
  WHERE plan_number LIKE 'TKT-' || date_str || '-%'
  AND user_id = NEW.user_id;

  new_number := 'TKT-' || date_str || '-' || LPAD(seq_num::TEXT, 3, '0');
  NEW.plan_number := new_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_session_number()
RETURNS TRIGGER AS $$
DECLARE
  date_str TEXT;
  seq_num INTEGER;
  new_number TEXT;
BEGIN
  date_str := TO_CHAR(NOW(), 'YYYYMMDD');

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(session_number FROM 'SES-[0-9]{8}-([0-9]+)') AS INTEGER)
  ), 0) + 1 INTO seq_num
  FROM sessions
  WHERE session_number LIKE 'SES-' || date_str || '-%'
  AND user_id = NEW.user_id;

  new_number := 'SES-' || date_str || '-' || LPAD(seq_num::TEXT, 3, '0');
  NEW.session_number := new_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 7. 実績時間自動集計関数
-- ========================================
CREATE OR REPLACE FUNCTION update_plan_actual_hours()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE plans
  SET actual_hours = (
    SELECT COALESCE(SUM(duration_minutes) / 60.0, 0)
    FROM sessions
    WHERE plan_id = COALESCE(NEW.plan_id, OLD.plan_id)
    AND duration_minutes IS NOT NULL
  )
  WHERE id = COALESCE(NEW.plan_id, OLD.plan_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.actual_start IS NOT NULL AND NEW.actual_end IS NOT NULL THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.actual_end - NEW.actual_start)) / 60;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 8. updated_at自動更新関数
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 9. トリガー設定
-- ========================================
-- 採番トリガー
CREATE TRIGGER trigger_generate_plan_number
  BEFORE INSERT ON plans
  FOR EACH ROW
  WHEN (NEW.plan_number IS NULL OR NEW.plan_number = '')
  EXECUTE FUNCTION generate_plan_number();

CREATE TRIGGER trigger_generate_session_number
  BEFORE INSERT ON sessions
  FOR EACH ROW
  WHEN (NEW.session_number IS NULL OR NEW.session_number = '')
  EXECUTE FUNCTION generate_session_number();

-- 実績時間集計トリガー
CREATE TRIGGER trigger_update_plan_hours_on_session_change
  AFTER INSERT OR UPDATE OR DELETE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_plan_actual_hours();

CREATE TRIGGER trigger_calculate_session_duration
  BEFORE INSERT OR UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_session_duration();

-- updated_atトリガー
CREATE TRIGGER trigger_update_tags_updated_at
  BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_plans_updated_at
  BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_sessions_updated_at
  BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_records_updated_at
  BEFORE UPDATE ON records FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================================
-- 10. RLS (Row Level Security)
-- ========================================
-- Tagsは既にRLS有効化済みのため、ポリシーのみ追加
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_tags ENABLE ROW LEVEL SECURITY;

-- Tags RLS（既存ポリシー削除済み、ファイル上部で作成済み）

-- plans RLS
CREATE POLICY "Users can view own plans" ON plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plans" ON plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plans" ON plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plans" ON plans FOR DELETE USING (auth.uid() = user_id);

-- Sessions RLS
CREATE POLICY "Users can view own sessions" ON sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON sessions FOR DELETE USING (auth.uid() = user_id);

-- Records RLS
CREATE POLICY "Users can view own records" ON records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own records" ON records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own records" ON records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own records" ON records FOR DELETE USING (auth.uid() = user_id);

-- plan Tags RLS
CREATE POLICY "Users can view own plan_tags" ON plan_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plan_tags" ON plan_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own plan_tags" ON plan_tags FOR DELETE USING (auth.uid() = user_id);

-- Session Tags RLS
CREATE POLICY "Users can view own session_tags" ON session_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own session_tags" ON session_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own session_tags" ON session_tags FOR DELETE USING (auth.uid() = user_id);
