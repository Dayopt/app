-- ============================================================
-- 課金・メール関連テーブル（読み物用 — CLIでは使用しない）
-- ============================================================
-- 最終同期日: 2026-07-29
-- 同期対象 migration:
--   - 20260318091249_create_email_suppressions.sql
--   - 20260319090000_create_stripe_webhook_events.sql
--   - 20260604230607_harden_function_execute_privileges.sql
--   - 20260716031801_stripe_webhook_state_machine.sql
--   - 20260726060800_account_deletion_gate_foundation.sql
--   - 20260726060870_repair_billing_mutation_claims.sql
--   - 20260726060880_bind_billing_account_deletion.sql
--   - 20260728082600_isolate_billing_mutation_response.sql
--   - 20260728082800_fence_billing_customer_provisioning.sql
--   - 20260728083100_harden_billing_customer_provisioning.sql
--   - 20260728110100_preserve_billing_webhook_terminal_receipt.sql
--

-- stripe_webhook_events: Stripe Webhook 冪等性キー
-- event_id で重複処理を防止
-- RLS: browser client は拒否、service_role のみ書き込み
CREATE TABLE public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed'
    CHECK (status IN ('processing', 'processed', 'failed')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX stripe_webhook_events_retryable_idx
  ON public.stripe_webhook_events (status, claimed_at)
  WHERE status <> 'processed';

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  p_event_id TEXT,
  p_event_type TEXT,
  p_stale_before TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  claimed_status TEXT;
BEGIN
  INSERT INTO public.stripe_webhook_events (
    event_id,
    event_type,
    status,
    claimed_at,
    processed_at
  )
  VALUES (p_event_id, p_event_type, 'processing', now(), NULL)
  ON CONFLICT (event_id) DO UPDATE
  SET
    event_type = EXCLUDED.event_type,
    status = 'processing',
    claimed_at = now(),
    processed_at = NULL
  WHERE public.stripe_webhook_events.status = 'failed'
    OR (
      public.stripe_webhook_events.status = 'processing'
      AND public.stripe_webhook_events.claimed_at < p_stale_before
    )
  RETURNING status INTO claimed_status;

  IF claimed_status IS NOT NULL THEN
    RETURN 'claimed';
  END IF;

  SELECT status
  INTO claimed_status
  FROM public.stripe_webhook_events
  WHERE event_id = p_event_id;

  IF claimed_status = 'processed' THEN
    RETURN 'already_processed';
  END IF;

  RETURN 'in_progress';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

-- email_suppressions: メール送信抑制リスト
-- バウンス・苦情のあったアドレスを記録し、再送を防止
-- RLS: browser client は拒否、service_role のみ書き込み
CREATE TABLE public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,            -- bounce/complaint
  source_event_id TEXT,            -- Resend のイベントID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Checkout / Portalをaccount削除と直列化する90日receipt。
-- redirect URLは別の短期tableへ分離し、provider retryは23時間に制限する。
CREATE TABLE private.billing_mutation_claims (
  operation_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mutation_kind TEXT NOT NULL,       -- checkout / portal
  state TEXT NOT NULL DEFAULT 'active', -- active / provider_started / completed / abandoned
  started_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  completed_at TIMESTAMPTZ,
  request_digest BYTEA NOT NULL,
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  provider_started_at TIMESTAMPTZ,
  provider_customer_id TEXT,
  provider_object_id TEXT,
  terminal_reason TEXT,
  delete_after TIMESTAMPTZ,
  provider_retry_deadline_at TIMESTAMPTZ
);

-- Stripe redirect capabilityだけを短期間保持する。
CREATE TABLE private.billing_mutation_responses (
  operation_id UUID PRIMARY KEY
    REFERENCES private.billing_mutation_claims(operation_id) ON DELETE CASCADE,
  response_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- generic account deletionへStripe Customer snapshotとterminal resultを束縛する。
CREATE TABLE private.billing_account_deletion_bindings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  generic_deletion_id UUID NOT NULL UNIQUE,
  stripe_customer_id_snapshot TEXT,
  state TEXT NOT NULL DEFAULT 'preparing', -- preparing / ready
  provider_outcome TEXT,                   -- deleted / not_present
  bound_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  ready_at TIMESTAMPTZ,
  FOREIGN KEY (user_id, generic_deletion_id)
    REFERENCES private.account_deletion_operations(user_id, deletion_id)
    ON DELETE CASCADE
);

-- lazy Stripe Customer作成のprovider response-lossを23時間だけ回復可能にする。
CREATE TABLE private.billing_customer_provisioning_attempts (
  operation_id UUID PRIMARY KEY
    REFERENCES private.billing_mutation_claims(operation_id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email_digest BYTEA NOT NULL,
  state TEXT NOT NULL DEFAULT 'active', -- active / provider_started
  lease_id UUID,
  lease_expires_at TIMESTAMPTZ,
  provider_started_at TIMESTAMPTZ,
  provider_retry_deadline_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

-- account削除後に遅れて届くStripe webhook用のpayload-free receipt。
CREATE TABLE private.billing_account_deletion_terminal_receipts (
  stripe_customer_id_digest BYTEA PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL
);
