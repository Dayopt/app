-- 既存の重複エントリをsoft deleteしてから重複制約を追加
-- 重複ペアのうち古い方(created_at)を残し、新しい方をsoft deleteする

-- 重複エントリのうち後から作られた方をsoft delete
WITH overlaps AS (
  SELECT
    e1.id AS keep_id,
    e2.id AS delete_id
  FROM public.entries e1
  JOIN public.entries e2
    ON e1.user_id = e2.user_id
    AND e1.id < e2.id
    AND e1.deleted_at IS NULL
    AND e2.deleted_at IS NULL
    AND e1.start_time IS NOT NULL AND e1.end_time IS NOT NULL
    AND e2.start_time IS NOT NULL AND e2.end_time IS NOT NULL
    AND tstzrange(e1.start_time, e1.end_time) && tstzrange(e2.start_time, e2.end_time)
)
UPDATE public.entries
SET deleted_at = NOW()
WHERE id IN (SELECT delete_id FROM overlaps)
  AND deleted_at IS NULL;

-- 制約を追加
ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_no_time_overlap;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_no_time_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (start_time IS NOT NULL AND end_time IS NOT NULL AND deleted_at IS NULL);
