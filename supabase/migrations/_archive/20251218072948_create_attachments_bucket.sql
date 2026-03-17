-- 添付ファイル用Storageバケットを作成
-- Supabase UI Library Dropzoneで使用

-- attachmentsバケットを作成（存在しない場合のみ）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  true,  -- 公開バケット（認証ユーザーのみアップロード可能）
  10485760,  -- 10MB制限
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLSポリシー: 認証ユーザーは自分のフォルダにアップロード可能
CREATE POLICY "Users can upload attachments to their folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLSポリシー: 認証ユーザーは自分のファイルを閲覧可能
CREATE POLICY "Users can view their own attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLSポリシー: 認証ユーザーは自分のファイルを更新可能
CREATE POLICY "Users can update their own attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLSポリシー: 認証ユーザーは自分のファイルを削除可能
CREATE POLICY "Users can delete their own attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
