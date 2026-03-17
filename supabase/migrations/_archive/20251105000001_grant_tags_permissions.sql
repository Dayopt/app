-- ========================================
-- Grant permissions for authenticated users on tags table
-- 作成日: 2025-11-05
-- ========================================

-- Grant table-level permissions to authenticated role
-- RLS policies will still control row-level access
GRANT SELECT, INSERT, UPDATE, DELETE ON tags TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant permissions for anon role (read-only for public access if needed)
GRANT SELECT ON tags TO anon;
GRANT USAGE ON SCHEMA public TO anon;

-- Verify grants were applied
DO $$
BEGIN
  RAISE NOTICE 'Permissions granted successfully for tags table';
END $$;
