import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  captureUnexpectedError: vi.fn(),
}));

vi.mock('next-intl/middleware', async () => {
  const { NextResponse: MockNextResponse } = await import('next/server');
  return { default: () => () => MockNextResponse.next() };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedError: mocks.captureUnexpectedError,
  observeAuthOperation: (_operation: string, call: () => PromiseLike<unknown>) => call(),
}));

vi.mock('@/lib/supabase/middleware', () => ({ updateSession: mocks.updateSession }));

import { proxy } from '../proxy';

function mockAuthenticatedSession(aalResult: {
  data: { currentLevel: string | null; nextLevel: string | null } | null;
  error: unknown;
}) {
  mocks.updateSession.mockResolvedValue({
    response: NextResponse.next(),
    user: { id: 'user-1' },
    supabase: {
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue(aalResult),
        },
      },
    },
  });
}

describe('proxy MFA gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_MAINTENANCE_MODE', 'false');
    vi.stubEnv('SKIP_AUTH_IN_DEV', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('preserves the locale when redirecting an AAL1 session with enrolled MFA', async () => {
    mockAuthenticatedSession({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });

    const response = await proxy(new NextRequest('https://app.dayopt.app/ja/week'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.dayopt.app/ja/auth/mfa-verify');
  });

  it('redirects to login when the MFA assurance lookup returns an error', async () => {
    mockAuthenticatedSession({ data: null, error: { message: 'lookup failed' } });

    const response = await proxy(new NextRequest('https://app.dayopt.app/week'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.dayopt.app/auth/login');
  });

  it.each([
    { currentLevel: 'aal1', nextLevel: 'aal1' },
    { currentLevel: 'aal2', nextLevel: 'aal2' },
  ])('does not redirect a valid $currentLevel session', async (data) => {
    mockAuthenticatedSession({ data, error: null });

    const response = await proxy(new NextRequest('https://app.dayopt.app/week'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
