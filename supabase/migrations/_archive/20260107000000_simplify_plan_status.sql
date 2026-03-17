-- Migration: Simplify Plan Status
-- Changes:
--   - Add completed_at column
--   - Change status from (todo, doing, done) to (open, done)
--   - Migrate existing data

-- 1. Add completed_at column
ALTER TABLE plans ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2. Drop old constraint FIRST (before any status updates)
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_status_check;

-- 3. Set completed_at for existing done records (use updated_at as approximation)
UPDATE plans
SET completed_at = updated_at
WHERE status = 'done' AND completed_at IS NULL;

-- 4. Migrate existing status values to new format
-- todo -> open
-- doing -> open
-- done -> done (unchanged)
UPDATE plans SET status = 'open' WHERE status IN ('todo', 'doing');

-- 5. Add new constraint
ALTER TABLE plans ADD CONSTRAINT plans_status_check CHECK (status IN ('open', 'done'));

-- 5. Update default value
ALTER TABLE plans ALTER COLUMN status SET DEFAULT 'open';

-- 6. Add index for completed_at (partial index for non-null values)
CREATE INDEX IF NOT EXISTS idx_plans_completed_at ON plans(completed_at) WHERE completed_at IS NOT NULL;

-- 7. Add comment for documentation
COMMENT ON COLUMN plans.completed_at IS 'Timestamp when status changed to done';
COMMENT ON COLUMN plans.status IS 'Plan status: open (incomplete) or done (completed)';
