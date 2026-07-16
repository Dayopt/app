-- ============================================================
-- 課金・メール関連テーブル（読み物用 — CLIでは使用しない）
-- ============================================================
-- 最終同期日: 2026-07-16
-- 同期対象 migration:
--   - 20260318091249_create_email_suppressions.sql
--   - 20260319090000_create_stripe_webhook_events.sql
--   - 20260604230607_harden_function_execute_privileges.sql
--   - 20260716031801_stripe_webhook_state_machine.sql
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
