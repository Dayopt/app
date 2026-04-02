-- avatars バケットが存在しない場合は作成、存在する場合は public を true に更新
-- 修正: "Bucket not found" エラーおよび getPublicUrl() との整合性
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;
