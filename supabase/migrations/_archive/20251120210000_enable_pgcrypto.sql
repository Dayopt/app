-- ========================================
-- enable_pgcrypto.sql
-- 作成日: 2025-11-20
-- 目的: pgcrypto拡張機能を有効化（authスキーマに）
-- 理由: GoTrue (Supabase Auth) がパスワードのハッシュ化に gen_salt() と crypt() を使用するため必須
-- ========================================

-- pgcrypto拡張機能を authスキーマ に作成
-- これにより、supabase_auth_admin (search_path=auth) が直接アクセスできる
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA auth;

-- 確認用
DO $$
BEGIN
  RAISE NOTICE 'pgcrypto extension has been enabled in auth schema';
  RAISE NOTICE 'gen_salt() and crypt() functions are now available for GoTrue in auth schema';
END $$;
