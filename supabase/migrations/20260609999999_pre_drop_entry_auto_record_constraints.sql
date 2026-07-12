-- Recovery bridge for production, where 20260610000000 fails while clearing
-- legacy actual ranges before replacing the old two-layer constraints.
--
-- This migration is intentionally ordered immediately before 20260610000000.
-- NOT VALID keeps legacy rows available for that migration's cleanup while the
-- constraints still protect writes made between the two migration commits.

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_actual_time_order;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_two_layer_shape;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_skip_shape;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_actual_time_order
  CHECK (
    deleted_at IS NOT NULL
    OR (actual_start_time IS NULL AND actual_end_time IS NULL)
    OR (
      actual_start_time IS NOT NULL
      AND actual_end_time IS NOT NULL
      AND actual_end_time > actual_start_time
    )
  ) NOT VALID;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_two_layer_shape
  CHECK (
    deleted_at IS NOT NULL
    OR (
      origin = 'planned'
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND (
        (actual_start_time IS NULL AND actual_end_time IS NULL)
        OR (actual_start_time IS NOT NULL AND actual_end_time IS NOT NULL)
      )
    )
    OR (
      origin = 'unplanned'
      AND start_time IS NULL
      AND end_time IS NULL
      AND actual_start_time IS NOT NULL
      AND actual_end_time IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_skip_shape
  CHECK (
    skipped_at IS NULL
    OR (
      origin = 'planned'
      AND actual_start_time IS NULL
      AND actual_end_time IS NULL
    )
  ) NOT VALID;
