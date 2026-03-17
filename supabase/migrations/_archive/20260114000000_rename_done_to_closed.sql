-- Migration: Rename plan status 'done' to 'closed'
-- Reason: 'open' / 'closed' is a more natural pair (like GitHub Issues)

-- 1. Update existing data
UPDATE plans SET status = 'closed' WHERE status = 'done';

-- 2. Drop old constraint
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_status_check;

-- 3. Add new constraint with 'closed' instead of 'done'
ALTER TABLE plans ADD CONSTRAINT plans_status_check CHECK (status IN ('open', 'closed'));

-- Add comment
COMMENT ON COLUMN plans.status IS 'Plan status: open (incomplete) or closed (completed)';
