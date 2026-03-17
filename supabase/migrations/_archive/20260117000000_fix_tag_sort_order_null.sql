-- Fix null sort_order values for existing tags
-- Tags are ordered by created_at within their parent group (user_id, parent_id)
-- This ensures deterministic ordering for DnD operations

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, parent_id
      ORDER BY created_at
    ) - 1 AS new_sort_order
  FROM tags
  WHERE sort_order IS NULL
)
UPDATE tags
SET sort_order = ranked.new_sort_order
FROM ranked
WHERE tags.id = ranked.id;

-- Add NOT NULL constraint with default value for future inserts
-- Note: Only add if not already NOT NULL
DO $$
BEGIN
  -- Check if sort_order is already NOT NULL
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tags'
    AND column_name = 'sort_order'
    AND is_nullable = 'YES'
  ) THEN
    -- Set default for any remaining nulls
    UPDATE tags SET sort_order = 0 WHERE sort_order IS NULL;

    -- Alter column to NOT NULL with default
    ALTER TABLE tags ALTER COLUMN sort_order SET DEFAULT 0;
    ALTER TABLE tags ALTER COLUMN sort_order SET NOT NULL;
  END IF;
END $$;
