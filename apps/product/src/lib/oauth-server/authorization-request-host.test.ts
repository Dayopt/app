import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  notFound: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/lib/logger', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

import { assertOAuthAuthorizationRequestHost } from './authorization-request-host';

describe('OAuth authorization request host boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ host: 'app.dayopt.app' }));
    mocks.notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows the active Production authorization host', async () => {
    await expect(assertOAuthAuthorizationRequestHost()).resolves.toBeUndefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('allows only the bound branch host on an OAuth-enabled Preview', async () => {
    vi.stubEnv('MCP_OAUTH_ENVIRONMENT', 'preview');
    vi.stubEnv('MCP_OAUTH_PREVIEW_BRANCH', 'codex/mcp-preview');
    vi.stubEnv(
      'OAUTH_AUTHORIZATION_SERVER_URI',
      'https://product-git-codex-mcp-preview-dayopt.vercel.app',
    );
    vi.stubEnv(
      'MCP_CANONICAL_RESOURCE_URI',
      'https://product-git-codex-mcp-preview-dayopt.vercel.app',
    );
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
    vi.stubEnv('VERCEL_BRANCH_URL', 'product-git-codex-mcp-preview-dayopt.vercel.app');
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'codex/mcp-preview');
    mocks.headers.mockResolvedValue(
      new Headers({ host: 'product-git-codex-mcp-preview-dayopt.vercel.app' }),
    );

    await expect(assertOAuthAuthorizationRequestHost()).resolves.toBeUndefined();
  });

  it('returns notFound when the deployment OAuth identity is invalid', async () => {
    vi.stubEnv('MCP_OAUTH_ENVIRONMENT', 'preview');

    await expect(assertOAuthAuthorizationRequestHost()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.loggerError).toHaveBeenCalledWith('OAuth deployment identity is invalid');
  });

  it.each([
    'mcp.dayopt.app',
    'staging.dayopt.app',
    'app.dayopt.app.example.com',
    'user@app.dayopt.app',
  ])('rejects a cross-surface or malformed host: %s', async (host) => {
    mocks.headers.mockResolvedValue(new Headers({ host }));

    await expect(assertOAuthAuthorizationRequestHost()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('disables OAuth when a generic Preview is accidentally served on the Production host', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview');

    await expect(assertOAuthAuthorizationRequestHost()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
