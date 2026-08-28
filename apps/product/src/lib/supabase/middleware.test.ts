import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureUnexpectedAuthError: vi.fn(),
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedAuthError: mocks.captureUnexpectedAuthError,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}));

import { NextRequest } from 'next/server';

import { updateSession } from './middleware';

describe('updateSession observability fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.captureUnexpectedAuthError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : error ? new Error('Supabase auth failure') : null,
    );
  });

  it('captures a returned auth failure once and continues as unauthenticated', async () => {
    const failure = new Error('Supabase unavailable');
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: failure });

    const result = await updateSession(new NextRequest('http://localhost:3000/auth/login'));

    expect(result.user).toBeNull();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledWith(failure, {
      operation: 'middleware_get_user',
      source: 'supabase_auth',
    });
  });

  it('captures a thrown auth failure once and continues as unauthenticated', async () => {
    const failure = new Error('Network failure');
    mocks.getUser.mockRejectedValue(failure);

    const result = await updateSession(new NextRequest('http://localhost:3000/auth/login'));

    expect(result.user).toBeNull();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledWith(failure, {
      operation: 'middleware_get_user',
      source: 'supabase_auth',
    });
  });

  it('keeps an expected auth failure unauthenticated even when the classifier drops it', async () => {
    const expected = Object.assign(new Error('Session expired'), {
      code: 'session_expired',
      status: 401,
    });
    mocks.captureUnexpectedAuthError.mockReturnValue(null);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'must-not-be-trusted' } },
      error: expected,
    });

    const result = await updateSession(new NextRequest('http://localhost:3000/week'));

    expect(result.user).toBeNull();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledWith(expected, {
      operation: 'middleware_get_user',
      source: 'supabase_auth',
    });
  });

  it('returns the authenticated user without capturing an error', async () => {
    const user = { id: '12345678-1234-4234-9234-123456789abc' };
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });

    const result = await updateSession(new NextRequest('http://localhost:3000/week'));

    expect(result.user).toBe(user);
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedAuthError).toHaveBeenCalledWith(null, {
      operation: 'middleware_get_user',
      source: 'supabase_auth',
    });
  });
});
