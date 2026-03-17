-- 時間重複を DB レベルで防止する exclusion constraint
-- TOCTOU レースコンディション対策: SELECT→INSERT の間に別リクエストが割り込んでも
-- PostgreSQL が原子的に排他制約を検証する

-- btree_gist: exclusion constraint で = 演算子と範囲演算子を組み合わせるために必要
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 同一ユーザー内で時間範囲が重複するエントリを禁止
-- start_time/end_time が両方 NOT NULL の場合のみ適用
ALTER TABLE public.entries
  ADD CONSTRAINT entries_no_time_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (start_time IS NOT NULL AND end_time IS NOT NULL);
