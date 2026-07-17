-- Existing rows and legacy-handler inserts are terminal. The new claimant writes processing explicitly.
ALTER TABLE public.stripe_webhook_events
  ADD COLUMN status TEXT NOT NULL DEFAULT 'processed',
  ADD COLUMN claimed_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.stripe_webhook_events
SET claimed_at = processed_at;

ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN processed_at DROP NOT NULL,
  ADD CONSTRAINT stripe_webhook_events_status_check
    CHECK (status IN ('processing', 'processed', 'failed'));

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

COMMENT ON COLUMN public.stripe_webhook_events.status IS
  'Delivery state: processing claims may be reclaimed after a timeout; processed rows are terminal; failed rows are retryable.';
COMMENT ON FUNCTION public.claim_stripe_webhook_event(TEXT, TEXT, TIMESTAMPTZ) IS
  'Atomically claims a new, failed, or stale Stripe delivery. Callable only by service_role.';
