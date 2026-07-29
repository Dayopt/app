import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod-v4';

const createMcpServer = vi.hoisted(() => vi.fn());

vi.mock('../_server', () => ({ createMcpServer }));

import { handleMcpProtocolRequest, resolveMcpRequestContext } from '../_protocol-handler';

const authInfo: AuthInfo = {
  token: '<redacted>',
  clientId: 'chatgpt',
  scopes: ['read:entries'],
  resource: new URL('https://mcp.dayopt.app'),
  extra: {
    tokenId: 'token-1',
    connectionId: 'connection-1',
    userId: 'user-1',
    resourceUri: 'https://mcp.dayopt.app',
  },
};

describe('MCP protocol handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMcpServer.mockImplementation(() => {
      const server = new McpServer({ name: 'dayopt-test', version: '1.0.0' });
      server.registerTool(
        'probe',
        {
          inputSchema: z.object({}).strict(),
          outputSchema: z.object({ ok: z.literal(true) }).strict(),
        },
        async () => ({
          content: [{ type: 'text', text: '{"ok":true}' }],
          structuredContent: { ok: true },
        }),
      );
      return server;
    });
  });

  it.each(['2025-03-26', '2025-06-18', '2025-11-25'])(
    'legacy %sのinitializeとtools/callでJSON framingを維持する',
    async (protocolVersion) => {
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: 'legacy-test', version: '1.0.0' },
        },
      };
      const request = createRequest(body, protocolVersion);

      const response = await handleMcpProtocolRequest(request, {
        authInfo,
        parsedBody: body,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('content-type')).not.toContain('text/event-stream');
      expect(response.headers.get('mcp-session-id')).toBeNull();
      await expect(response.json()).resolves.toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion },
      });

      const callBody = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'probe', arguments: {} },
      };
      const callResponse = await handleMcpProtocolRequest(
        createRequest(callBody, protocolVersion),
        {
          authInfo,
          parsedBody: callBody,
        },
      );

      expect(callResponse.status).toBe(200);
      expect(callResponse.headers.get('content-type')).toContain('application/json');
      expect(callResponse.headers.get('content-type')).not.toContain('text/event-stream');
      expect(callResponse.headers.get('mcp-session-id')).toBeNull();
      await expect(callResponse.json()).resolves.toMatchObject({
        jsonrpc: '2.0',
        id: 2,
        result: {
          structuredContent: { ok: true },
        },
      });
    },
  );

  it('AuthInfoを既存request contextへexactにbindする', () => {
    expect(resolveMcpRequestContext(authInfo)).toEqual({
      tokenId: 'token-1',
      connectionId: 'connection-1',
      userId: 'user-1',
      clientId: 'chatgpt',
      scopes: ['read:entries'],
      resourceUri: 'https://mcp.dayopt.app',
    });
  });

  it.each([
    {
      label: 'principal missing',
      value: { ...authInfo, extra: { ...authInfo.extra, userId: undefined } },
    },
    {
      label: 'token binding missing',
      value: { ...authInfo, extra: { ...authInfo.extra, tokenId: undefined } },
    },
    {
      label: 'connection binding missing',
      value: { ...authInfo, extra: { ...authInfo.extra, connectionId: undefined } },
    },
    {
      label: 'unknown client',
      value: { ...authInfo, clientId: 'unknown-client' },
    },
    {
      label: 'unknown scope',
      value: { ...authInfo, scopes: ['read:entries', 'admin:all'] },
    },
    {
      label: 'resource mismatch',
      value: { ...authInfo, resource: new URL('https://attacker.example') },
    },
  ])('$labelをserver生成前にfail closedする', async ({ value }) => {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'legacy-test', version: '1.0.0' },
      },
    };

    const response = await handleMcpProtocolRequest(createRequest(body, '2025-11-25'), {
      authInfo: value as AuthInfo,
      parsedBody: body,
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal error' },
      id: null,
    });
    expect(createMcpServer).not.toHaveBeenCalled();
  });
});

function createRequest(body: unknown, protocolVersion: string): Request {
  return new Request('https://mcp.dayopt.app/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': protocolVersion,
    },
    body: JSON.stringify(body),
  });
}
