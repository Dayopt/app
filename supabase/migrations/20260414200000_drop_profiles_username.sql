-- ============================================================
-- profiles.username を削除し full_name に統合
-- ソーシャル機能がないためユニークユーザー名は不要
-- ============================================================

-- 1. username に値があり full_name が空のレコードを移行
UPDATE profiles
  SET full_name = username
  WHERE username IS NOT NULL AND (full_name IS NULL OR full_name = '');

-- 2. username カラムを削除（UNIQUE制約・インデックスも自動削除）
ALTER TABLE profiles DROP COLUMN username;
