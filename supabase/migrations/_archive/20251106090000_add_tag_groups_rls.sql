-- Tag Groups RLS Policies

-- RLS有効化（既に有効かもしれないが念のため）
ALTER TABLE tag_groups ENABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "Users can view own tag_groups" ON tag_groups;
DROP POLICY IF EXISTS "Users can insert own tag_groups" ON tag_groups;
DROP POLICY IF EXISTS "Users can update own tag_groups" ON tag_groups;
DROP POLICY IF EXISTS "Users can delete own tag_groups" ON tag_groups;

-- 自分のタググループを閲覧
CREATE POLICY "Users can view own tag_groups"
  ON tag_groups
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 自分のタググループを作成
CREATE POLICY "Users can insert own tag_groups"
  ON tag_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 自分のタググループを更新
CREATE POLICY "Users can update own tag_groups"
  ON tag_groups
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 自分のタググループを削除
CREATE POLICY "Users can delete own tag_groups"
  ON tag_groups
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
