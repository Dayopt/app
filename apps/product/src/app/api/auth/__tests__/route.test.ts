import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withUpstashRateLimit: vi.fn(),
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  captureUnexpectedAuthError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

vi.mock('@/lib/rate-limit/upstash', () => ({
  loginRateLimit: { kind: 'login' },
  passwordResetRateLimit: { kind: 'password-reset' },
  withUpstashRateLimit: mocks.withUpstashRateLimit,
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedAuthError: mocks.captureUnexpectedAuthError,
  isExpectedAuthError: () => false,
  observeAuthOperation: (_operation: string, action: () => unknown) => action(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));

import { loginRateLimit, passwordResetRateLimit } from '@/lib/rate-limit/upstash';
import { POST } from '../route';

function authRequest(body: unknown): NextRequest {
  return new NextRequest('https://app.dayopt.app/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.10' },
    body: JSON.stringify(body),
  });
}

function signInRequest(email = 'person@example.com'): NextRequest {
  return authRequest({
    action: 'signin',
    email,
    password: 'not-a-real-password',
  });
}

describe('POST /api/auth rate-limit boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: { access_token: 'test-session' } },
      error: null,
    });
    mocks.signUp.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: null },
      error: null,
    });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mocks.withUpstashRateLimit.mockResolvedValue({ state: 'disabled' });
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signUp: mocks.signUp,
        signOut: mocks.signOut,
        resetPasswordForEmail: mocks.resetPasswordForEmail,
      },
    });
  });

  it('checks independent IP and normalized email buckets for signin', async () => {
    const response = await POST(signInRequest('Person@Example.COM'));

    expect(response.status).toBe(200);
    expect(mocks.withUpstashRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      loginRateLimit,
      'email:person@example.com',
    );
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'Person@Example.COM',
      password: 'not-a-real-password',
    });
  });

  it('checks independent IP and normalized email buckets for password reset', async () => {
    const response = await POST(
      authRequest({ action: 'reset-password', email: 'Person@Example.COM' }),
    );

    expect(response.status).toBe(200);
    expect(mocks.withUpstashRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      passwordResetRateLimit,
      'email:person@example.com',
    );
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('Person@Example.COM', {
      redirectTo: 'http://localhost:3000/auth/reset-password',
    });
  });

  it('keeps signup on the existing IP-only limiter', async () => {
    const response = await POST(
      authRequest({
        action: 'signup',
        email: 'person@example.com',
        password: 'not-a-real-password',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.withUpstashRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      loginRateLimit,
      undefined,
    );
    expect(mocks.withUpstashRateLimit).toHaveBeenCalledOnce();
  });

  it('does not rate limit signout or invalid request bodies', async () => {
    const signoutResponse = await POST(authRequest({ action: 'signout' }));
    const invalidResponse = await POST(authRequest({ action: 'signin', email: 'invalid' }));

    expect(signoutResponse.status).toBe(200);
    expect(invalidResponse.status).toBe(400);
    expect(mocks.withUpstashRateLimit).not.toHaveBeenCalled();
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
