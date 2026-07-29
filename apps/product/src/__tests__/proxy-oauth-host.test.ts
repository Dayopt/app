import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const updateSession = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock('next-intl/middleware', () => ({
  default: () => () => new Response(null, { status: 200 }),
}));
vi.mock('@/lib/supabase/middleware', () => ({ updateSession }));
vi.mock('@/lib/logger', () => ({
  logger: {
    error: loggerError,
    warn: vi.fn(),
  },
}));
vi.mock('@/lib/sentry', () => ({
  captureUnexpectedError: vi.fn(),
  observeAuthOperation: vi.fn(),
}));

import { proxy } from '../proxy';

describe('proxy OAuth host boundary', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    'https://preview-product.vercel.app/api/mcp',
    'https://app.dayopt.app/api/mcp',
    'https://app.dayopt.app/api/mcp/',
    'https://mcp.dayopt.app/api/oauth/token',
    'https://mcp.dayopt.app.example.com/mcp',
  ])('rejects a foreign or cross-surface host before auth/database work: %s', async (url) => {
    const response = await proxy(new NextRequest(url));

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('allows the exact Production MCP host', async () => {
    const response = await proxy(new NextRequest('https://mcp.dayopt.app/mcp'));

    expect(response.status).toBe(200);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('allows the exact staging MCP host only under the staging identity', async () => {
    vi.stubEnv('MCP_OAUTH_ENVIRONMENT', 'staging');
    vi.stubEnv('OAUTH_AUTHORIZATION_SERVER_URI', 'https://staging.dayopt.app');
    vi.stubEnv('MCP_CANONICAL_RESOURCE_URI', 'https://mcp.staging.dayopt.app');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'staging');

    const allowed = await proxy(new NextRequest('https://mcp.staging.dayopt.app/mcp'));
    const productionHost = await proxy(new NextRequest('https://mcp.dayopt.app/mcp'));

    expect(allowed.status).toBe(200);
    expect(productionHost.status).toBe(404);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('rejects the inactive Product host even for a normal application path', async () => {
    const response = await proxy(new NextRequest('https://staging.dayopt.app/week'));

    expect(response.status).toBe(404);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('keeps every fixed OAuth host disabled on a generic Preview deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview');

    const authorizationResponse = await proxy(
      new NextRequest('https://app.dayopt.app/oauth/authorize'),
    );
    const productResponse = await proxy(new NextRequest('https://app.dayopt.app/week'));
    const resourceResponse = await proxy(new NextRequest('https://mcp.dayopt.app/mcp'));

    expect(authorizationResponse.status).toBe(404);
    expect(productResponse.status).toBe(404);
    expect(resourceResponse.status).toBe(404);
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('allows both OAuth surfaces and Product paths only on the bound Preview branch alias', async () => {
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

    for (const path of ['/oauth/authorize', '/api/oauth/token', '/mcp', '/api/mcp', '/week']) {
      const response = await proxy(
        new NextRequest(`https://product-git-codex-mcp-preview-dayopt.vercel.app${path}`),
      );
      expect(response.status, path).toBeLessThan(400);
    }

    for (const url of [
      'https://product-a1b2c3-dayopt.vercel.app/oauth/authorize',
      'https://product-a1b2c3-dayopt.vercel.app/mcp',
      'https://product-git-codex-mcp-preview-dayopt.vercel.app.example.com/api/mcp',
      'https://app.dayopt.app/oauth/authorize',
      'https://mcp.dayopt.app/mcp',
    ]) {
      const response = await proxy(new NextRequest(url));
      expect(response.status, url).toBe(404);
    }
    expect(updateSession).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the deployed Preview branch differs from the configured branch', async () => {
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
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'codex/other-branch');

    const response = await proxy(
      new NextRequest('https://product-git-codex-mcp-preview-dayopt.vercel.app/mcp'),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'service_unavailable' });
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('fails closed on a known staging host when the staging identity is incomplete', async () => {
    vi.stubEnv('MCP_OAUTH_ENVIRONMENT', 'staging');
    vi.stubEnv('OAUTH_AUTHORIZATION_SERVER_URI', 'https://staging.dayopt.app');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'staging');

    const response = await proxy(new NextRequest('https://mcp.staging.dayopt.app/mcp'));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'service_unavailable' });
    expect(loggerError).toHaveBeenCalledWith('OAuth deployment identity is invalid');
    expect(updateSession).not.toHaveBeenCalled();
  });
});
