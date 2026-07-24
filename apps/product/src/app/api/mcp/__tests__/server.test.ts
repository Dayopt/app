import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerEntriesListTool = vi.hoisted(() => vi.fn());
const registerTagsListTool = vi.hoisted(() => vi.fn());
const registerConstraintsGetTool = vi.hoisted(() => vi.fn());
const registerPlansListTool = vi.hoisted(() => vi.fn());
const registerRecordsListTool = vi.hoisted(() => vi.fn());
const registerPlansGetTool = vi.hoisted(() => vi.fn());
const registerRecordsGetTool = vi.hoisted(() => vi.fn());
const registerPlansTrashListTool = vi.hoisted(() => vi.fn());
const registerRecordsTrashListTool = vi.hoisted(() => vi.fn());
const registerPlansCreateTool = vi.hoisted(() => vi.fn());
const registerPlansUpdateTool = vi.hoisted(() => vi.fn());
const registerPlansDeleteTool = vi.hoisted(() => vi.fn());
const registerPlansRestoreTool = vi.hoisted(() => vi.fn());
const registerRecordsCreateTool = vi.hoisted(() => vi.fn());
const registerRecordsUpdateTool = vi.hoisted(() => vi.fn());
const registerRecordsDeleteTool = vi.hoisted(() => vi.fn());
const registerRecordsRestoreTool = vi.hoisted(() => vi.fn());

vi.mock('../_tools/entries-list', () => ({ registerEntriesListTool }));
vi.mock('../_tools/tags-list', () => ({ registerTagsListTool }));
vi.mock('../_tools/constraints-get', () => ({ registerConstraintsGetTool }));
vi.mock('../_tools/timeblock-list', () => ({ registerPlansListTool, registerRecordsListTool }));
vi.mock('../_tools/timeblock-detail', () => ({
  registerPlansGetTool,
  registerPlansTrashListTool,
  registerRecordsGetTool,
  registerRecordsTrashListTool,
}));
vi.mock('../_tools/timeblock-mutations', () => ({
  registerPlansCreateTool,
  registerPlansUpdateTool,
  registerPlansDeleteTool,
  registerPlansRestoreTool,
  registerRecordsCreateTool,
  registerRecordsUpdateTool,
  registerRecordsDeleteTool,
  registerRecordsRestoreTool,
}));

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
    expect(registerPlansGetTool).toHaveBeenCalledWith(server, baseContext);
    expect(registerRecordsListTool).toHaveBeenCalledWith(server, baseContext);
    expect(registerRecordsGetTool).toHaveBeenCalledWith(server, baseContext);
    expect(registerTagsListTool).not.toHaveBeenCalled();
    expect(registerConstraintsGetTool).not.toHaveBeenCalled();
    expect(registerPlansTrashListTool).not.toHaveBeenCalled();
    expect(registerRecordsTrashListTool).not.toHaveBeenCalled();
    expect(registerPlansCreateTool).not.toHaveBeenCalled();
    expect(registerPlansUpdateTool).not.toHaveBeenCalled();
    expect(registerPlansDeleteTool).not.toHaveBeenCalled();
    expect(registerPlansRestoreTool).not.toHaveBeenCalled();
    expect(registerRecordsCreateTool).not.toHaveBeenCalled();
    expect(registerRecordsUpdateTool).not.toHaveBeenCalled();
    expect(registerRecordsDeleteTool).not.toHaveBeenCalled();
    expect(registerRecordsRestoreTool).not.toHaveBeenCalled();
  });

  it('registers only the trash tool whose delete scope is granted', () => {
    const context: McpRequestContext = {
      ...baseContext,
      scopes: ['read:entries', 'delete:plans'],
    };
    const server = createMcpServer(context);

    expect(registerPlansTrashListTool).toHaveBeenCalledWith(server, context);
    expect(registerPlansDeleteTool).toHaveBeenCalledWith(server, context);
    expect(registerPlansRestoreTool).toHaveBeenCalledWith(server, context);
    expect(registerRecordsTrashListTool).not.toHaveBeenCalled();
  });

  it('registers all and only mutation tools covered by effective write scopes', () => {
    const context: McpRequestContext = {
      ...baseContext,
      scopes: ['read:entries', 'write:plans', 'write:records', 'delete:records'],
    };
    const server = createMcpServer(context);

    expect(registerPlansCreateTool).toHaveBeenCalledWith(server, context);
    expect(registerPlansUpdateTool).toHaveBeenCalledWith(server, context);
    expect(registerPlansDeleteTool).not.toHaveBeenCalled();
    expect(registerPlansRestoreTool).not.toHaveBeenCalled();
    expect(registerRecordsCreateTool).toHaveBeenCalledWith(server, context);
    expect(registerRecordsUpdateTool).toHaveBeenCalledWith(server, context);
    expect(registerRecordsTrashListTool).toHaveBeenCalledWith(server, context);
    expect(registerRecordsDeleteTool).toHaveBeenCalledWith(server, context);
    expect(registerRecordsRestoreTool).toHaveBeenCalledWith(server, context);
  });

  it('read:tagsではtags.listだけを公開する', () => {
    const context: McpRequestContext = { ...baseContext, scopes: ['read:tags'] };
    const server = createMcpServer(context);

    expect(registerTagsListTool).toHaveBeenCalledWith(server, context);
    expect(registerConstraintsGetTool).not.toHaveBeenCalled();
    expect(registerEntriesListTool).not.toHaveBeenCalled();
    expect(registerPlansListTool).not.toHaveBeenCalled();
    expect(registerPlansGetTool).not.toHaveBeenCalled();
    expect(registerRecordsListTool).not.toHaveBeenCalled();
    expect(registerRecordsGetTool).not.toHaveBeenCalled();
    expect(registerPlansTrashListTool).not.toHaveBeenCalled();
    expect(registerRecordsTrashListTool).not.toHaveBeenCalled();
    expect(registerPlansCreateTool).not.toHaveBeenCalled();
    expect(registerPlansUpdateTool).not.toHaveBeenCalled();
    expect(registerPlansDeleteTool).not.toHaveBeenCalled();
    expect(registerPlansRestoreTool).not.toHaveBeenCalled();
    expect(registerRecordsCreateTool).not.toHaveBeenCalled();
    expect(registerRecordsUpdateTool).not.toHaveBeenCalled();
    expect(registerRecordsDeleteTool).not.toHaveBeenCalled();
    expect(registerRecordsRestoreTool).not.toHaveBeenCalled();
  });

  it('read:constraintsではconstraints.getだけを公開する', () => {
    const context: McpRequestContext = { ...baseContext, scopes: ['read:constraints'] };
    const server = createMcpServer(context);

    expect(registerConstraintsGetTool).toHaveBeenCalledWith(server, context);
    expect(registerTagsListTool).not.toHaveBeenCalled();
    expect(registerEntriesListTool).not.toHaveBeenCalled();
    expect(registerPlansListTool).not.toHaveBeenCalled();
    expect(registerRecordsListTool).not.toHaveBeenCalled();
  });
});
