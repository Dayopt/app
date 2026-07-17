import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withUpstashRateLimit: vi.fn(),
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  captureUnexpectedAuthError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

vi.mock('@/lib/rate-limit/upstash', () => ({
  loginRateLimit: {},
  passwordResetRateLimit: {},
  withUpstashRateLimit: mocks.withUpstashRateLimit,
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedAuthError: mocks.captureUnexpectedAuthError,
  isExpectedAuthError: () => false,
  observeAuthOperation: (_operation: string, action: () => unknown) => action(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));

import { POST } from './route';

function signInRequest(): NextRequest {
  return new NextRequest('https://app.dayopt.app/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.10' },
    body: JSON.stringify({
      action: 'signin',
      email: 'person@example.com',
      password: 'not-a-real-password',
    }),
  });
}

describe('POST /api/auth rate-limit boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: { access_token: 'test-session' } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { signInWithPassword: mocks.signInWithPassword },
    });
  });

  it('fails closed with 503 and never reaches Supabase when Upstash is unavailable', async () => {
    mocks.withUpstashRateLimit.mockResolvedValue({ state: 'unavailable' });

    const response = await POST(signInRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.captureUnexpectedAuthError).not.toHaveBeenCalled();
  });

  it('keeps Preview and Development disabled mode compatible with the existing auth flow', async () => {
    mocks.withUpstashRateLimit.mockResolvedValue({ state: 'disabled' });

    const response = await POST(signInRequest());

    expect(response.status).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'not-a-real-password',
    });
  });

  it('returns 429 with limit metadata and never reaches Supabase when the quota is exhausted', async () => {
    mocks.withUpstashRateLimit.mockResolvedValue({
      state: 'checked',
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    });

    const response = await POST(signInRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
