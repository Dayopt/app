import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerEntriesListTool = vi.hoisted(() => vi.fn());
const registerPlansListTool = vi.hoisted(() => vi.fn());
const registerRecordsListTool = vi.hoisted(() => vi.fn());

vi.mock('../_tools/entries-list', () => ({ registerEntriesListTool }));
vi.mock('../_tools/timeblock-list', () => ({ registerPlansListTool, registerRecordsListTool }));

import type { McpRequestContext } from '../_context';
import { createMcpServer } from '../_server';

const baseContext: McpRequestContext = {
  tokenId: 'token-1',
  connectionId: 'connection-1',
  userId: 'user-1',
  clientId: 'chatgpt',
  scopes: ['read:entries'],
  resourceUri: 'https://mcp.dayopt.app' as McpRequestContext['resourceUri'],
};

describe('MCP scope-filtered tool discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers entry tools only when read:entries is granted', () => {
    const server = createMcpServer(baseContext);

    expect(registerEntriesListTool).toHaveBeenCalledWith(server, baseContext);
    expect(registerPlansListTool).toHaveBeenCalledWith(server, baseContext);
    expect(registerRecordsListTool).toHaveBeenCalledWith(server, baseContext);
  });

  it('does not expose entry tools for an unrelated scope', () => {
    createMcpServer({ ...baseContext, scopes: ['read:tags'] });

    expect(registerEntriesListTool).not.toHaveBeenCalled();
    expect(registerPlansListTool).not.toHaveBeenCalled();
    expect(registerRecordsListTool).not.toHaveBeenCalled();
  });
});
