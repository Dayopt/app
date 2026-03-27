-- ============================================================
-- Fix: Supabase Security Advisor 警告の一括修正
--
-- 1. Security Definer View の削除（レガシー）
-- 2. RLS未設定バックアップテーブルの削除（データ移行済み）
-- 3. Search Path Mutable な関数の削除（レガシー）
-- 4. btree_gist を extensions スキーマに移動
-- ============================================================

-- 1. Security Definer View: tag_relations_stats を削除
DROP VIEW IF EXISTS public.tag_relations_stats;

-- 2. RLS未設定テーブル: レガシーバックアップテーブルを削除
--    _backup_record_tags が _backup_records を参照している可能性があるため先に削除
DROP TABLE IF EXISTS public._backup_record_tags;
DROP TABLE IF EXISTS public._backup_records;

-- 3. Search Path Mutable: レガシー関数を削除
DROP FUNCTION IF EXISTS public.delete_tag_with_replacement;
DROP FUNCTION IF EXISTS public.delete_tag_promote_children;
DROP FUNCTION IF EXISTS public.delete_tag_completely;
DROP FUNCTION IF EXISTS public.cleanup_tag_relations_on_plan_entry_delete;

-- 4. Extension in Public: btree_gist を extensions スキーマに移動
--    排他制約 entries_no_time_overlap が依存しているため、一旦削除して再作成
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_no_time_overlap;

DROP EXTENSION IF EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;

-- 排他制約を再作成（soft-delete 済みエントリを除外）
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
    RAISE NOTICE 'Skipping entries_no_time_overlap constraint: existing overlapping data found.';
END;
$$;
