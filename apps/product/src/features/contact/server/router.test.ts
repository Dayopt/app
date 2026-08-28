import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const mocks = vi.hoisted(() => ({
  contactLimit: vi.fn(),
  globalLimit: vi.fn(),
  deliverContactFeedback: vi.fn(),
}));

vi.mock('@/lib/rate-limit/upstash', () => ({
  contactRateLimit: { limit: mocks.contactLimit },
  contactGlobalRateLimit: { limit: mocks.globalLimit },
  trpcUserRateLimit: null,
}));

vi.mock('./contact-service', () => ({
  deliverContactFeedback: mocks.deliverContactFeedback,
}));

import { contactRouter } from './router';

const createCaller = createCallerFactory(contactRouter);
const INPUT = {
  submissionId: '550e8400-e29b-41d4-a716-446655440000',
  category: 'question' as const,
  message: 'A valid contact message',
  environment: {
    appVersion: '0.32.1',
    os: 'Test OS',
    browser: 'Test Browser',
    timezone: 'UTC',
    language: 'en',
  },
};

function authenticatedCaller() {
  const ctx = createMockContext({ userId: 'user-1' });
  ctx.supabase.auth.getUser = vi.fn().mockResolvedValue({
    data: {
      user: {
        id: 'user-1',
        email: 'person@example.com',
        user_metadata: { full_name: 'Test User' },
      },
    },
    error: null,
  });
  return createCaller(ctx);
}

describe('contact router rate-limit availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contactLimit.mockResolvedValue({ success: true });
    mocks.globalLimit.mockResolvedValue({ success: true });
    mocks.deliverContactFeedback.mockResolvedValue({ delivered: true });
  });

  it('returns SERVICE_UNAVAILABLE and skips delivery when the per-user backend fails', async () => {
    mocks.contactLimit.mockRejectedValue(new Error('Upstash unavailable'));

    await expect(authenticatedCaller().submit(INPUT)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(mocks.globalLimit).not.toHaveBeenCalled();
    expect(mocks.deliverContactFeedback).not.toHaveBeenCalled();
  });

  it('returns SERVICE_UNAVAILABLE and skips delivery when the global backend fails', async () => {
    mocks.globalLimit.mockRejectedValue(new Error('Upstash unavailable'));

    await expect(authenticatedCaller().submit(INPUT)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(mocks.contactLimit).toHaveBeenCalledWith('user-1');
    expect(mocks.deliverContactFeedback).not.toHaveBeenCalled();
  });
});
