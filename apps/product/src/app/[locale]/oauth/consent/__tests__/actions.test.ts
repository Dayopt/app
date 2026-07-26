import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertRequestHost: vi.fn(),
  validateAuthorizeInput: vi.fn(),
  createClient: vi.fn(),
  createOAuthDbClient: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/oauth-server/authorization-request-host', () => ({
  assertOAuthAuthorizationRequestHost: mocks.assertRequestHost,
}));
vi.mock('@/lib/oauth-server', () => ({
  createOAuthDbClient: mocks.createOAuthDbClient,
  generateAuthorizationCode: vi.fn(),
  hasWriteScope: vi.fn(),
  isRuntimeClientWriteEnabled: vi.fn(),
  validateAuthorizeInput: mocks.validateAuthorizeInput,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: vi.fn(),
  observeAuthOperation: vi.fn(),
}));

import { processConsent } from '../actions';

describe('OAuth consent action host boundary', () => {
  it('rejects the request host before parameter validation, user lookup, or grant writes', async () => {
    mocks.assertRequestHost.mockRejectedValueOnce(new Error('unexpected OAuth host'));

    await expect(processConsent(new FormData())).rejects.toThrow('unexpected OAuth host');

    expect(mocks.validateAuthorizeInput).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createOAuthDbClient).not.toHaveBeenCalled();
  });
});
