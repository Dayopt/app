-- ========================================
-- Tag Groups Feature
-- 作成日: 2025-11-06
-- 目的: タグをグループ化して管理する機能
-- ========================================

-- ========================================
-- 1. tag_groups テーブル
-- ========================================
CREATE TABLE tag_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,  -- URLフレンドリーな識別子（'project', 'priority'等）
  description TEXT,
  color TEXT,  -- グループのデフォルトカラー（タグが色未設定時に継承）
  sort_order INTEGER DEFAULT 0,  -- 表示順序
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- ユーザーごとにslugは一意
  UNIQUE(user_id, slug)
);

-- インデックス
CREATE INDEX idx_tag_groups_user_id ON tag_groups(user_id);
CREATE INDEX idx_tag_groups_slug ON tag_groups(slug);
CREATE INDEX idx_tag_groups_sort_order ON tag_groups(sort_order);

-- ========================================
-- 2. tags テーブルに group_id カラムを追加
-- ========================================
ALTER TABLE tags ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES tag_groups(id) ON DELETE SET NULL;

-- group_id用のインデックス
CREATE INDEX IF NOT EXISTS idx_tags_group_id ON tags(group_id);

-- ========================================
-- 3. RLS (Row Level Security)
-- ========================================
ALTER TABLE tag_groups ENABLE ROW LEVEL SECURITY;

-- Tag Groups RLS
CREATE POLICY "Users can view own tag groups"
  ON tag_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tag groups"
  ON tag_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tag groups"
  ON tag_groups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tag groups"
  ON tag_groups FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================
-- 4. updated_at 自動更新トリガー
-- ========================================
CREATE TRIGGER trigger_update_tag_groups_updated_at
  BEFORE UPDATE ON tag_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ========================================
-- 5. デフォルトグループの作成（オプション）
-- ========================================
-- 注意: この部分はユーザーが初めてタグページを訪れた時に
-- アプリケーション側で作成することも検討できます
--
-- 例: 未分類グループ
-- INSERT INTO tag_groups (user_id, name, slug, sort_order)
-- SELECT id, '未分類', 'uncategorized', 999
-- FROM auth.users;
