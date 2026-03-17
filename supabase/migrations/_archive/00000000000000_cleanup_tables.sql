-- ========================================
-- auth関連テーブル以外を削除
-- ========================================

-- auth関連テーブルを保護して、それ以外を削除
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT IN (
            'account',           -- auth関連
            'profile',           -- auth関連
            'profiles',          -- auth関連
            'login_attempts'     -- auth関連（アカウントロックアウト）
        )
    ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        RAISE NOTICE 'Dropped table: %', r.tablename;
    END LOOP;
END $$;
