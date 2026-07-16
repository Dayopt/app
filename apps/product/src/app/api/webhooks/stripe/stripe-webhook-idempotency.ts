import 'server-only';

import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;
export type StripeWebhookClaim = 'claimed' | 'already_processed' | 'in_progress';

const STALE_CLAIM_AFTER_MS = 5 * 60 * 1000;

const captureContext = {
  feature: 'billing',
  route: '/api/webhooks/stripe',
  source: 'supabase_database',
} as const;

/** Atomically reserve a new, failed, or stale Stripe event. */
export async function claimStripeWebhookEvent(
  supabase: ServiceRoleClient,
  event: { id: string; type: string },
): Promise<StripeWebhookClaim> {
  const { data, error } = await supabase.rpc('claim_stripe_webhook_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_stale_before: new Date(Date.now() - STALE_CLAIM_AFTER_MS).toISOString(),
  });

  if (error) {
    throw captureUnexpectedDatabaseError(error, {
      ...captureContext,
      operation: 'claim_stripe_webhook_event',
      requestId: event.id,
    });
  }
  if (data === 'claimed' || data === 'already_processed' || data === 'in_progress') {
    return data;
  }

  throw captureUnexpectedDatabaseError(new Error('Stripe claim returned an invalid state'), {
    ...captureContext,
    operation: 'claim_stripe_webhook_event',
    requestId: event.id,
  });
}

/** Mark a fully handled Stripe delivery as terminal before acknowledging it. */
export async function markStripeWebhookEventProcessed(
  supabase: ServiceRoleClient,
  eventId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('stripe_webhook_events')
    .update({ status: 'processed', processed_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('status', 'processing')
    .select('event_id')
    .maybeSingle();

  if (!error && data) return;
  throw captureUnexpectedDatabaseError(
    error ?? new Error('Stripe delivery state was not processing'),
    {
      ...captureContext,
      operation: 'mark_stripe_webhook_event_processed',
      requestId: eventId,
    },
  );
}

/** Best-effort failed state for Stripe retry; cleanup failure is separately observable. */
export async function releaseStripeWebhookEvent(
  supabase: ServiceRoleClient,
  eventId: string,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('stripe_webhook_events')
      .update({ status: 'failed', processed_at: null })
      .eq('event_id', eventId)
      .eq('status', 'processing')
      .select('event_id')
      .maybeSingle();
    if (error || !data) {
      captureUnexpectedDatabaseError(
        error ?? new Error('Stripe delivery state was not processing'),
        {
          ...captureContext,
          operation: 'release_stripe_webhook_event',
          requestId: eventId,
        },
      );
    }
  } catch (error) {
    captureUnexpectedDatabaseError(error, {
      ...captureContext,
      operation: 'release_stripe_webhook_event',
      requestId: eventId,
    });
  }
}
