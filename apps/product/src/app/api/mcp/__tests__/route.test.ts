import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyAccessToken = vi.hoisted(() => vi.fn());
const extractBearerToken = vi.hoisted(() => vi.fn(() => 'opaque-token'));
const createMcpServer = vi.hoisted(() => vi.fn());
const connect = vi.hoisted(() => vi.fn());
const handleRequest = vi.hoisted(() => vi.fn());

vi.mock('@/lib/mcp', () => ({ extractBearerToken, verifyAccessToken }));
vi.mock('../_server', () => ({ createMcpServer }));
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

function createRequest(body: unknown) {
  return new NextRequest('https://mcp.dayopt.app/mcp', {
    method: 'POST',
    headers: {
      authorization: 'Bearer opaque-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('MCP route scope preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccessToken.mockResolvedValue(baseAuth);
    createMcpServer.mockReturnValue({ connect });
    connect.mockResolvedValue(undefined);
    handleRequest.mockResolvedValue(
      Response.json({ jsonrpc: '2.0', result: {}, id: 1 }, { status: 200 }),
    );
  });

  it('returns HTTP 403 with a step-up challenge before a cached write tool executes', async () => {
    const response = await POST(
      createRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'plans.create', arguments: {} },
        id: 1,
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('www-authenticate')).toContain('error="insufficient_scope"');
    expect(response.headers.get('www-authenticate')).toContain('scope="write:plans"');
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://mcp.dayopt.app/.well-known/oauth-protected-resource"',
    );
    await expect(response.json()).resolves.toMatchObject({
      error: 'insufficient_scope',
      scope: 'write:plans',
    });
    expect(createMcpServer).not.toHaveBeenCalled();
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('fails the whole batch before executing any call when one tool lacks scope', async () => {
    const response = await POST(
      createRequest([
        { jsonrpc: '2.0', method: 'tools/list', id: 1 },
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'records.delete', arguments: {} },
          id: 2,
        },
      ]),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('www-authenticate')).toContain('scope="delete:records"');
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('passes a permitted call and the already parsed body to the SDK transport', async () => {
    verifyAccessToken.mockResolvedValue({ ...baseAuth, scopes: ['write:plans'] });
    const body = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'plans.create', arguments: {} },
      id: 1,
    };

    const response = await POST(createRequest(body));

    expect(response.status).toBe(200);
    expect(createMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 'token-1',
        connectionId: 'connection-1',
        scopes: ['write:plans'],
        resourceUri: 'https://mcp.dayopt.app',
      }),
    );
    expect(handleRequest).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({ parsedBody: body }),
    );
  });
});
