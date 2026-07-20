import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    UPSTASH_REDIS_REST_URL: undefined as string | undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined as string | undefined,
    VERCEL_ENV: 'preview' as string | undefined,
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/platform/config/env', () => ({ env: mocks.env }));
vi.mock('./rate-limit', () => ({
  hashRateLimitIdentifier: vi.fn(async () => 'hashed-event'),
  RateLimitUnavailableError: class RateLimitUnavailableError extends Error {},
}));

import {
  claimResendWebhookEvent,
  completeResendWebhookEvent,
  releaseResendWebhookEvent,
} from './resend-webhook-dedup';

describe('Web Resend webhook deduplication availability', () => {
  beforeEach(() => {
    mocks.env.VERCEL_ENV = 'preview';
  });

  it('keeps a local no-op lease available outside Production', async () => {
    const claim = await claimResendWebhookEvent('event-1');
    expect(claim).toMatchObject({ status: 'claimed' });
    if (claim.status !== 'claimed') throw new Error('Expected a local claim');
    await expect(completeResendWebhookEvent('event-1', claim.token)).resolves.toBeUndefined();
    await expect(releaseResendWebhookEvent('event-1', claim.token)).resolves.toBeUndefined();
  });

  it('fails closed when Redis is unavailable in Production', async () => {
    mocks.env.VERCEL_ENV = 'production';
    await expect(claimResendWebhookEvent('event-1')).rejects.toThrow();
    await expect(completeResendWebhookEvent('event-1', 'lease-1')).rejects.toThrow();
    await expect(releaseResendWebhookEvent('event-1', 'lease-1')).rejects.toThrow();
  });
});
