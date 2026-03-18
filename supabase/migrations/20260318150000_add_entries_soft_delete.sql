-- ============================================================
-- Soft-delete for entries
-- deleted_at カラム追加 + SELECT RLS を更新して削除済みを除外
-- ============================================================

-- 1. deleted_at カラム追加
ALTER TABLE public.entries
  ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. インデックス（soft-delete フィルタ高速化 + クリーンアップ用）
CREATE INDEX idx_entries_deleted_at ON public.entries (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 3. SELECT RLS ポリシー更新（deleted_at IS NULL で自動フィルタ）
DROP POLICY "Users can view own plans" ON public.entries;
CREATE POLICY "Users can view own plans" ON public.entries
  FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    AND deleted_at IS NULL
  );

-- NOTE: UPDATE / DELETE ポリシーは変更不要
-- UPDATE は deleted_at = NULL への復元にも使われるため、
-- user_id チェックのみで削除済みエントリへのアクセスを維持
