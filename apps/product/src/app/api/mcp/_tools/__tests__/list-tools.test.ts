import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpRequestContext } from '../../_server';
import { registerEntriesListTool } from '../entries-list';
import { registerTimeblockListTools } from '../timeblock-list';

const createMcpTrpcCaller = vi.hoisted(() => vi.fn());

vi.mock('@/lib/mcp/trpc-bridge', () => ({ createMcpTrpcCaller }));

interface ListInput {
  startDate?: string;
  endDate?: string;
  tagId?: string;
  limit?: number;
}

interface TextToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

type ToolHandler = (input: ListInput) => Promise<TextToolResult>;

const context: McpRequestContext = {
  tokenId: 'token-1',
  connectionId: 'connection-1',
  userId: 'user-1',
  clientId: 'chatgpt',
  scopes: ['read:entries'],
  resourceUri: 'https://mcp.dayopt.app' as McpRequestContext['resourceUri'],
};

const plan = {
  created_at: '2026-07-01T00:00:00.000Z',
  deleted_at: null,
  end_at: '2026-07-01T11:00:00.000Z',
  external_calendar_event_id: null,
  id: 'plan-1',
  note: null,
  skipped_at: null,
  source: 'manual',
  start_at: '2026-07-01T10:00:00.000Z',
  tag_id: null,
  title: 'Plan',
  updated_at: '2026-07-01T00:00:00.000Z',
  user_id: context.userId,
};

const record = {
  created_at: '2026-07-01T00:00:00.000Z',
  deleted_at: null,
  end_at: '2026-07-01T12:00:00.000Z',
  external_calendar_event_id: null,
  id: 'record-1',
  note: null,
  plan_id: null,
  source: 'manual',
  start_at: '2026-07-01T11:00:00.000Z',
  tag_id: null,
  title: 'Record',
  updated_at: '2026-07-01T00:00:00.000Z',
  user_id: context.userId,
};

function createServerDouble() {
  const handlers = new Map<string, ToolHandler>();
  const registerTool = vi.fn((name: string, _config: unknown, handler: unknown) => {
    handlers.set(name, handler as ToolHandler);
  });

  return {
    handlers,
    server: { registerTool } as unknown as McpServer,
  };
}

function getHandler(handlers: Map<string, ToolHandler>, name: string): ToolHandler {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`Missing MCP handler: ${name}`);
  return handler;
}

function parseText(result: TextToolResult): Record<string, unknown> {
  const content = result.content[0];
  if (!content) throw new Error('Missing MCP text content');
  return JSON.parse(content.text) as Record<string, unknown>;
}

describe('MCP list tools public contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMcpTrpcCaller.mockReturnValue({
      plans: { list: vi.fn().mockResolvedValue([plan]) },
      records: { list: vi.fn().mockResolvedValue([record]) },
    });
  });

  it('records.listはnon-empty結果にfulfillment_scoreを含めない', async () => {
    const { handlers, server } = createServerDouble();
    registerTimeblockListTools(server, context);

    const result = parseText(await getHandler(handlers, 'records.list')({}));
    const records = result.records as Array<Record<string, unknown>>;

    expect(result.count).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0]).not.toHaveProperty('fulfillment_score');
  });

  it('entries.listはnon-empty結果に削除対象キーを含めない', async () => {
    const { handlers, server } = createServerDouble();
    registerEntriesListTool(server, context);

    const result = parseText(await getHandler(handlers, 'entries.list')({}));
    const entries = result.entries as Array<Record<string, unknown>>;

    expect(result.count).toBe(2);
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry).not.toHaveProperty('fulfillment_score');
      expect(entry).not.toHaveProperty('chronotype_settings');
    }
  });
});
