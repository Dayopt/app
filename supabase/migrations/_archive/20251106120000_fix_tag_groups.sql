-- tag_groupsテーブル作成
CREATE TABLE IF NOT EXISTS tag_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_tag_groups_user_id ON tag_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_tag_groups_slug ON tag_groups(slug);
CREATE INDEX IF NOT EXISTS idx_tag_groups_sort_order ON tag_groups(sort_order);

-- tags テーブルに group_id カラムを追加
ALTER TABLE tags ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES tag_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tags_group_id ON tags(group_id);

-- RLS有効化
ALTER TABLE tag_groups ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（認証済みユーザーのみ）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tag_groups' AND policyname = 'Users can view own tag_groups'
  ) THEN
    CREATE POLICY "Users can view own tag_groups"
      ON tag_groups FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tag_groups' AND policyname = 'Users can insert own tag_groups'
  ) THEN
    CREATE POLICY "Users can insert own tag_groups"
      ON tag_groups FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tag_groups' AND policyname = 'Users can update own tag_groups'
  ) THEN
    CREATE POLICY "Users can update own tag_groups"
      ON tag_groups FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tag_groups' AND policyname = 'Users can delete own tag_groups'
  ) THEN
    CREATE POLICY "Users can delete own tag_groups"
      ON tag_groups FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- updated_at自動更新トリガー
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_tag_groups_updated_at'
  ) THEN
    CREATE TRIGGER trigger_update_tag_groups_updated_at
      BEFORE UPDATE ON tag_groups
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
