import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpMutationError } from '@/features/timeblock/server/service-index';

const verifyAccessToken = vi.hoisted(() => vi.fn());
const checkMcpPreAuthRateLimit = vi.hoisted(() => vi.fn());
const checkMcpUserRateLimit = vi.hoisted(() => vi.fn());
const createMcpTrpcCaller = vi.hoisted(() => vi.fn());
const tagsList = vi.hoisted(() => vi.fn());
const createPlan = vi.hoisted(() => vi.fn());

vi.mock('@/lib/mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp')>()),
  verifyAccessToken,
}));
vi.mock('@/lib/mcp/request-rate-limit', () => ({
  checkMcpPreAuthRateLimit,
  checkMcpUserRateLimit,
}));
vi.mock('@/lib/mcp/trpc-bridge', () => ({ createMcpTrpcCaller }));
vi.mock('@/features/timeblock/server/service-index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/timeblock/server/service-index')>()),
  McpMutationClient: class McpMutationClient {
    createPlan = createPlan;
  },
}));

import { DELETE, GET, POST } from '../route';

const tagId = '00000000-0000-4000-8000-000000000001';
const planId = '00000000-0000-4000-8000-000000000002';
const operationId = '00000000-0000-4000-8000-000000000003';
const auth = {
  tokenId: 'token-1',
  connectionId: 'connection-1',
  userId: 'user-1',
  clientId: 'chatgpt' as const,
  scopes: [
    'read:entries',
    'read:tags',
    'read:constraints',
    'read:stats',
    'write:plans',
    'delete:plans',
    'write:records',
    'delete:records',
  ],
  proEntitled: true,
  resourceUri: 'https://mcp.dayopt.app' as const,
  expiresAt: 1_800_000_000,
};

describe('MCP route protocol integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkMcpPreAuthRateLimit.mockResolvedValue('allowed');
    checkMcpUserRateLimit.mockResolvedValue('allowed');
    verifyAccessToken.mockResolvedValue(auth);
    tagsList.mockResolvedValue({
      data: [
        {
          id: tagId,
          name: 'Work',
          color: 'blue',
          icon: 'briefcase',
          parent_id: null,
          sort_order: 0,
        },
      ],
    });
    createMcpTrpcCaller.mockReturnValue({ tags: { list: tagsList } });
    createPlan.mockResolvedValue({
      schemaVersion: 1,
      operationId,
      resourceType: 'plan',
      resourceId: planId,
      version: '2026-07-29T00:00:00.000000Z',
      deletedAt: null,
      replayed: false,
    });
  });

  it('legacy clientへJSON responseを維持する', async () => {
    const responses: Array<{
      method: string;
      status: number;
      contentType: string | null;
      sessionId: string | null;
    }> = [];
    const routeFetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const response = await dispatchRoute(request);
      responses.push({
        method: request.method,
        status: response.status,
        contentType: response.headers.get('content-type'),
        sessionId: response.headers.get('mcp-session-id'),
      });
      return response;
    };
    const transport = new StreamableHTTPClientTransport(new URL('https://mcp.dayopt.app/mcp'), {
      fetch: routeFetch,
      requestInit: { headers: { authorization: 'Bearer opaque-token' } },
    });
    const client = new Client(
      { name: 'dayopt-legacy-route-test', version: '1.0.0' },
      { versionNegotiation: { mode: 'legacy' } },
    );

    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(18);
      const read = await client.callTool({ name: 'tags.list', arguments: {} });
      expect(read.isError).not.toBe(true);
      expect(read.structuredContent).toMatchObject({
        schemaVersion: 1,
        count: 1,
      });
      const responseContentTypes = responses
        .filter(
          (response) =>
            response.method === 'POST' && response.status === 200 && response.contentType !== null,
        )
        .map((response) => response.contentType);
      expect(responseContentTypes.length).toBeGreaterThanOrEqual(2);
      expect(
        responseContentTypes.every((contentType) => contentType?.includes('application/json')),
        JSON.stringify(responseContentTypes),
      ).toBe(true);
      expect(
        responses
          .filter((response) => response.method === 'POST')
          .every((response) => !response.contentType?.includes('text/event-stream')),
      ).toBe(true);
      expect(responses.every((response) => response.sessionId === null)).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('2026-07-28 clientのlist/read/mutationを実POST経由でsessionなしに処理する', async () => {
    const responses: Array<{
      status: number;
      contentType: string | null;
      sessionId: string | null;
    }> = [];
    const routeFetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const response = await dispatchRoute(request);
      responses.push({
        status: response.status,
        contentType: response.headers.get('content-type'),
        sessionId: response.headers.get('mcp-session-id'),
      });
      return response;
    };
    const transport = new StreamableHTTPClientTransport(new URL('https://mcp.dayopt.app/mcp'), {
      fetch: routeFetch,
      requestInit: { headers: { authorization: 'Bearer opaque-token' } },
    });
    const client = new Client(
      { name: 'dayopt-modern-route-test', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );

    try {
      await client.connect(transport);
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(18);

      const read = await client.callTool({ name: 'tags.list', arguments: {} });
      expect(read.isError).not.toBe(true);
      expect(read.structuredContent).toEqual({
        schemaVersion: 1,
        count: 1,
        tags: [
          {
            id: tagId,
            name: 'Work',
            color: 'blue',
            icon: 'briefcase',
            parentId: null,
            sortOrder: 0,
          },
        ],
      });
      expect(createMcpTrpcCaller).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: auth.userId,
          clientId: auth.clientId,
          scopes: auth.scopes,
        }),
      );

      const mutationArguments = {
        operationId,
        title: 'Future plan',
        note: null,
        tagId: null,
        startAt: '2026-08-01T10:00:00+0900',
        endAt: '2026-08-01T11:00:00+0900',
      };
      const mutation = await client.callTool({
        name: 'plans.create',
        arguments: mutationArguments,
      });
      expect(mutation.isError).not.toBe(true);
      expect(mutation.structuredContent).toMatchObject({
        schemaVersion: 1,
        operationId,
        resourceId: planId,
      });
      expect(createPlan).toHaveBeenCalledWith({
        ...mutationArguments,
        connectionId: auth.connectionId,
        accessTokenId: auth.tokenId,
      });

      createPlan.mockRejectedValueOnce(
        new McpMutationError('TIME_OVERLAP', 'This time range overlaps with an existing item.'),
      );
      const domainError = await client.callTool({
        name: 'plans.create',
        arguments: { ...mutationArguments, operationId: '00000000-0000-4000-8000-000000000004' },
      });
      expect(domainError.isError).toBe(true);
      expect(domainError.structuredContent).toBeUndefined();
      expect(JSON.stringify(domainError)).toContain('TIME_OVERLAP');

      expect(responses.length).toBeGreaterThanOrEqual(5);
      expect(responses.every((response) => response.status === 200)).toBe(true);
      expect(responses.every((response) => response.sessionId === null)).toBe(true);
    } finally {
      await client.close();
    }
  });
});

function dispatchRoute(request: Request): Promise<Response> {
  const nextRequest = new NextRequest(request);
  if (request.method === 'POST') return POST(nextRequest);
  if (request.method === 'GET') return GET(nextRequest);
  if (request.method === 'DELETE') return DELETE(nextRequest);
  return Promise.resolve(new Response(null, { status: 405 }));
}
