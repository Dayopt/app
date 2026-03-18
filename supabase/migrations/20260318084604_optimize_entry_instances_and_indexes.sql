-- ============================================================
-- P3: entry_instances user_id追加 + クエリ最適化インデックス
-- ============================================================

-- 1. entry_instances に user_id カラム追加
--    現状: RLSが entries テーブルへの EXISTS サブクエリで user_id を確認
--    改善: user_id を直接持つことでサブクエリ不要に（データ量増加時に効く）
ALTER TABLE public.entry_instances
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 既存データのバックフィル（entries テーブルから user_id をコピー）
UPDATE public.entry_instances ei
SET user_id = e.user_id
FROM public.entries e
WHERE ei.entry_id = e.id
  AND ei.user_id IS NULL;

-- NOT NULL 制約を追加（バックフィル完了後）
ALTER TABLE public.entry_instances
  ALTER COLUMN user_id SET NOT NULL;

-- user_id インデックス追加
CREATE INDEX IF NOT EXISTS idx_entry_instances_user_id
  ON public.entry_instances (user_id);

-- 2. RLSポリシーを user_id 直接参照に変更（EXISTSサブクエリ廃止）
DROP POLICY IF EXISTS "Users can view own plan instances" ON public.entry_instances;
CREATE POLICY "Users can view own plan instances" ON public.entry_instances
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own plan instances" ON public.entry_instances;
CREATE POLICY "Users can insert own plan instances" ON public.entry_instances
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own plan instances" ON public.entry_instances;
CREATE POLICY "Users can update own plan instances" ON public.entry_instances
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own plan instances" ON public.entry_instances;
CREATE POLICY "Users can delete own plan instances" ON public.entry_instances
  FOR DELETE USING ((select auth.uid()) = user_id);

-- 3. entries.end_time インデックス追加
--    時間重複チェック（checkTimeOverlap）で end_time > startTime の条件に使用
--    start_time のインデックスは既存だが end_time がないためフルスキャンになる
CREATE INDEX IF NOT EXISTS idx_entries_end_time
  ON public.entries (end_time)
  WHERE end_time IS NOT NULL;

-- 4. 複合インデックス: user_id + start_time + end_time（重複チェック最適化）
CREATE INDEX IF NOT EXISTS idx_entries_user_time_range
  ON public.entries (user_id, start_time, end_time)
  WHERE start_time IS NOT NULL AND end_time IS NOT NULL;
