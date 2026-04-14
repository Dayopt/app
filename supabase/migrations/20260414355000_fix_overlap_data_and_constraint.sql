-- 既存の重複エントリをsoft deleteしてから重複制約を追加

WITH duplicate_entries AS (
  SELECT
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
WHERE id IN (SELECT delete_id FROM duplicate_entries)
  AND deleted_at IS NULL;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_no_time_overlap;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_no_time_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (start_time IS NOT NULL AND end_time IS NOT NULL AND deleted_at IS NULL);
