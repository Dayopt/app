import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sentry', () => ({ captureUnexpectedDatabaseError }));

import {
  claimStripeWebhookEvent,
  markStripeWebhookEventProcessed,
  releaseStripeWebhookEvent,
  type StripeWebhookClaim,
} from '../stripe-webhook-idempotency';

function createRpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

function createStateClient(result: { data?: unknown; error?: unknown; throws?: Error }) {
  const maybeSingle = result.throws
    ? vi.fn().mockRejectedValue(result.throws)
    : vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  const select = vi.fn(() => ({ maybeSingle }));
  const statusEq = vi.fn(() => ({ select }));
  const eventEq = vi.fn(() => ({ eq: statusEq }));
  const update = vi.fn(() => ({ eq: eventEq }));
  const from = vi.fn(() => ({ update }));
  return { client: { from } as never, from, maybeSingle, update };
}

describe('Stripe webhook idempotency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T03:00:00.000Z'));
    vi.clearAllMocks();
    captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each<StripeWebhookClaim>(['claimed', 'already_processed', 'in_progress'])(
    'returns the atomic claim state %s',
    async (state) => {
      const { client, rpc } = createRpcClient({ data: state, error: null });

      await expect(
        claimStripeWebhookEvent(client, { id: 'evt-1', type: 'invoice.created' }),
      ).resolves.toBe(state);
      expect(rpc).toHaveBeenCalledWith('claim_stripe_webhook_event', {
        p_event_id: 'evt-1',
        p_event_type: 'invoice.created',
        p_stale_before: '2026-07-16T02:55:00.000Z',
      });
      expect(captureUnexpectedDatabaseError).not.toHaveBeenCalled();
    },
  );

  it('fails closed and captures a claim database error once', async () => {
    const claimError = { code: 'PGRST500', message: 'database unavailable' };
    const { client } = createRpcClient({ data: null, error: claimError });
    const captured = new Error('Unexpected database failure', { cause: claimError });
    captureUnexpectedDatabaseError.mockReturnValueOnce(captured);

    await expect(
      claimStripeWebhookEvent(client, { id: 'evt-failed', type: 'invoice.created' }),
    ).rejects.toBe(captured);
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
  });

  it('rejects and captures an unknown claim response', async () => {
    const { client } = createRpcClient({ data: 'unknown', error: null });

    await expect(
      claimStripeWebhookEvent(client, { id: 'evt-invalid', type: 'invoice.created' }),
    ).rejects.toThrow('Stripe claim returned an invalid state');
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
  });

  it('marks a processing delivery as processed before acknowledgement', async () => {
    const { client, update } = createStateClient({ data: { event_id: 'evt-processed' } });

    await expect(markStripeWebhookEventProcessed(client, 'evt-processed')).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({
      status: 'processed',
      processed_at: '2026-07-16T03:00:00.000Z',
    });
    expect(captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });

  it.each([{ error: { code: 'PGRST500', message: 'update failed' } }, { data: null }])(
    'fails closed when processed state cannot be persisted',
    async (result) => {
      const { client } = createStateClient(result);

      await expect(markStripeWebhookEventProcessed(client, 'evt-mark')).rejects.toThrow();
      expect(captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { error: { code: 'PGRST500', message: 'update failed' } },
    { data: null },
    { throws: new Error('network failed') },
  ])('captures failed-state persistence without masking the original error', async (result) => {
    const { client, update } = createStateClient(result);

    await expect(releaseStripeWebhookEvent(client, 'evt-cleanup')).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({ status: 'failed', processed_at: null });
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
  });
});
