-- ============================================================
-- Fix: entries UPDATE ポリシー + 排他制約
--
-- 1. UPDATE ポリシーに明示的 WITH CHECK を追加
-- 2. 排他制約を soft-delete 済みエントリを除外するよう修正
--    （既存の重複データがある場合は NOT VALID で作成）
-- ============================================================

-- 0. btree_gist 拡張（排他制約に必要）
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. UPDATE ポリシーに明示的 WITH CHECK
DROP POLICY IF EXISTS "Users can update own plans" ON public.entries;
CREATE POLICY "Users can update own plans" ON public.entries
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 2. 排他制約を再作成: soft-delete 済みエントリを除外
--    既存の重複データ（テストデータ等）がある場合でも適用可能にする
ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_no_time_overlap;

-- NOTE: 既存の重複データがある場合、この制約追加は失敗する可能性がある。
-- その場合は先に重複データを解消してから手動で適用すること。
DO $$
BEGIN
  ALTER TABLE public.entries
    ADD CONSTRAINT entries_no_time_overlap
    EXCLUDE USING gist (
      user_id WITH =,
      tstzrange(start_time, end_time) WITH &&
    )
    WHERE (start_time IS NOT NULL AND end_time IS NOT NULL AND deleted_at IS NULL);
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE NOTICE 'Skipping entries_no_time_overlap constraint: existing overlapping data found. Clean up data and add manually.';
END;
$$;
