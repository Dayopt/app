-- Stripe billing columns on profiles table
-- stripe_customer_id: Stripe Customer ID (cus_xxx)
-- subscription_status: Stripe subscription status
-- subscription_id: Stripe subscription ID (sub_xxx)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_id text UNIQUE;

-- Index for quick lookup by stripe_customer_id (webhook handler)
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Constraint: subscription_status must be a known value
ALTER TABLE profiles
  ADD CONSTRAINT chk_subscription_status
  CHECK (subscription_status IN ('free', 'active', 'past_due', 'canceled', 'trialing'));
