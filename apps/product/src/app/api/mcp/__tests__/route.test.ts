import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OAuthServerError } from '@/lib/oauth-server';

const verifyAccessToken = vi.hoisted(() => vi.fn());
const createMcpServer = vi.hoisted(() => vi.fn());
const connect = vi.hoisted(() => vi.fn());
const handleRequest = vi.hoisted(() => vi.fn());
const checkMcpPreAuthRateLimit = vi.hoisted(() => vi.fn());
const checkMcpUserRateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp')>()),
  verifyAccessToken,
}));
vi.mock('../_server', () => ({ createMcpServer }));
vi.mock('@/lib/mcp/request-rate-limit', () => ({
  checkMcpPreAuthRateLimit,
  checkMcpUserRateLimit,
}));
vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: class {
    handleRequest(request: Request, options: unknown) {
      return handleRequest(request, options);
    }
  },
}));

import { POST } from '../route';

const baseAuth = {
  tokenId: 'token-1',
  connectionId: 'connection-1',
  userId: 'user-1',
  clientId: 'chatgpt' as const,
  scopes: ['read:entries'] as const,
  resourceUri: 'https://mcp.dayopt.app' as const,
  expiresAt: 1_800_000_000,
};

function createRequest(body: unknown, authorization: string | null = 'Bearer opaque-token') {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (authorization) headers.set('authorization', authorization);
  return new NextRequest('https://mcp.dayopt.app/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('MCP route scope preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkMcpPreAuthRateLimit.mockResolvedValue('allowed');
    verifyAccessToken.mockResolvedValue(baseAuth);
    checkMcpUserRateLimit.mockResolvedValue('allowed');
    createMcpServer.mockReturnValue({ connect });
    connect.mockResolvedValue(undefined);
    handleRequest.mockResolvedValue(
      Response.json({ jsonrpc: '2.0', result: {}, id: 1 }, { status: 200 }),
    );
  });

  it('returns HTTP 403 before a cached registered tool executes without its scope', async () => {
    verifyAccessToken.mockResolvedValue({ ...baseAuth, scopes: ['read:tags'] });
    const response = await POST(
      createRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'plans.list', arguments: {} },
        id: 1,
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('www-authenticate')).toContain('error="insufficient_scope"');
    expect(response.headers.get('www-authenticate')).toContain('scope="read:entries read:tags"');
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://mcp.dayopt.app/.well-known/oauth-protected-resource"',
    );
    await expect(response.json()).resolves.toMatchObject({
      error: 'insufficient_scope',
      scope: 'read:entries read:tags',
    });
    expect(createMcpServer).not.toHaveBeenCalled();
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('rejects JSON-RPC batch before executing any call', async () => {
    const response = await POST(
      createRequest([
        { jsonrpc: '2.0', method: 'tools/list', id: 1 },
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'records.list', arguments: {} },
          id: 2,
        },
      ]),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('www-authenticate')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: -32600, message: 'JSON-RPC batch is not supported' },
    });
    expect(createMcpServer).not.toHaveBeenCalled();
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('challenges a cached trash call with base read and the missing delete scope', async () => {
    const response = await POST(
      createRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'plans.trash.list', arguments: {} },
        id: 1,
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('www-authenticate')).toContain('scope="read:entries delete:plans"');
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('challenges a cached mutation call with the complete read and write grant', async () => {
    const response = await POST(
      createRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'plans.create', arguments: {} },
        id: 1,
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('www-authenticate')).toContain('scope="read:entries write:plans"');
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('passes a permitted call and the already parsed body to the SDK transport', async () => {
    const body = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'plans.list', arguments: {} },
      id: 1,
    };

    const response = await POST(createRequest(body));

    expect(response.status).toBe(200);
    expect(createMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 'token-1',
        connectionId: 'connection-1',
        scopes: ['read:entries'],
        resourceUri: 'https://mcp.dayopt.app',
      }),
    );
    expect(handleRequest).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({ parsedBody: body }),
    );
    expect(checkMcpUserRateLimit).toHaveBeenCalledWith(baseAuth.userId);
    expect(checkMcpPreAuthRateLimit).toHaveBeenCalledWith(expect.any(NextRequest));
  });

  it('limits unauthenticated traffic before bearer token database verification', async () => {
    checkMcpPreAuthRateLimit.mockResolvedValueOnce('limited');

    const response = await POST(createRequest({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(checkMcpUserRateLimit).not.toHaveBeenCalled();
    expect(createMcpServer).not.toHaveBeenCalled();
  });

  it('returns 429 without a bearer challenge when the authenticated user exceeds the limit', async () => {
    checkMcpUserRateLimit.mockResolvedValueOnce('limited');

    const response = await POST(createRequest({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));

    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('www-authenticate')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Too many requests' },
    });
    expect(createMcpServer).not.toHaveBeenCalled();
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('returns retryable 503 without triggering reauthorization when rate limiting is unavailable', async () => {
    checkMcpUserRateLimit.mockResolvedValueOnce('unavailable');

    const response = await POST(createRequest({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('5');
    expect(response.headers.get('www-authenticate')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Rate limit service unavailable' },
    });
    expect(createMcpServer).not.toHaveBeenCalled();
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('does not issue a scope challenge for an unregistered candidate tool name', async () => {
    handleRequest.mockResolvedValueOnce(
      Response.json(
        {
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Method not found' },
          id: 1,
        },
        { status: 200 },
      ),
    );

    const response = await POST(
      createRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'plans.skip', arguments: {} },
        id: 1,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('www-authenticate')).toBeNull();
    expect(handleRequest).toHaveBeenCalledOnce();
  });

  it('returns a discovery challenge without an error when credentials are absent', async () => {
    const response = await POST(
      createRequest({ jsonrpc: '2.0', method: 'tools/list', id: 1 }, null),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('www-authenticate')).toContain('scope="read:entries"');
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
    expect(response.headers.get('www-authenticate')).not.toContain('error=');
    await expect(response.text()).resolves.toBe('');
  });

  it('returns invalid_token for expired or revoked bearer credentials', async () => {
    verifyAccessToken.mockRejectedValueOnce(
      new OAuthServerError('invalid_token', 'OAuth connection is no longer authorized', 401),
    );

    const response = await POST(createRequest({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('www-authenticate')).toContain('error="invalid_token"');
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_token',
      error_description: 'Access token is invalid or expired',
    });
  });

  it('returns an invalid_request challenge for a malformed bearer value', async () => {
    const response = await POST(
      createRequest({ jsonrpc: '2.0', method: 'tools/list', id: 1 }, 'Bearer token,second'),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('www-authenticate')).toContain('Bearer error="invalid_request"');
    expect(response.headers.get('www-authenticate')).toContain('scope="read:entries"');
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_request',
      error_description: 'Authorization header must be "Bearer <token>"',
    });
  });

  it('returns a retryable 503 when token authorization dependencies fail', async () => {
    verifyAccessToken.mockRejectedValueOnce(
      new OAuthServerError('server_error', 'Access token verification failed', 503),
    );

    const response = await POST(createRequest({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('5');
    expect(response.headers.get('www-authenticate')).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: 'server_error',
      error_description: 'Authentication service unavailable',
    });
  });
});
