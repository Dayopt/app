-- ========================================
-- fix_pgcrypto_final.sql
-- 作成日: 2025-11-20
-- 目的: pgcrypto を完全に削除してから auth スキーマに再作成
-- ========================================

-- 既存の pgcrypto を削除
DROP EXTENSION IF EXISTS pgcrypto CASCADE;

-- auth スキーマに pgcrypto を作成
CREATE EXTENSION pgcrypto WITH SCHEMA auth;

-- 確認
DO $$
BEGIN
  RAISE NOTICE 'pgcrypto has been recreated in auth schema';
END $$;
