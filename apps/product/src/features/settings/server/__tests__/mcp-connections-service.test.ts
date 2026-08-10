import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

import { McpConnectionsService, McpConnectionsServiceError } from '../mcp-connections-service';

const USER_ID = 'user-1';
const CONNECTION_ID = 'connection-1';

const connectionRow = {
  id: CONNECTION_ID,
  client_id: 'claude-ai',
  scopes: ['read:entries'],
  authorized_at: '2026-08-01T00:00:00.000Z',
  last_used_at: '2026-08-05T00:00:00.000Z',
};

function createService(
  query: ReturnType<typeof createChainableMock>,
  rpc = vi.fn().mockResolvedValue({ data: null, error: null }),
) {
  const from = vi.fn(() => query);
  return {
    service: new McpConnectionsService({ from, rpc } as never),
    from,
    rpc,
  };
}

describe('McpConnectionsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('自分の未 revoke connection を authorized_at 降順で明示カラムだけ取得する', async () => {
      const query = createChainableMock([connectionRow]);
      const { service, from } = createService(query);

      const result = await service.list(USER_ID);

      expect(result).toEqual([connectionRow]);
      expect(from).toHaveBeenCalledWith('oauth_connections');
      expect(query.select).toHaveBeenCalledWith(
        'id, client_id, scopes, authorized_at, last_used_at',
      );
      expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
      expect(query.is).toHaveBeenCalledWith('revoked_at', null);
      expect(query.order).toHaveBeenCalledWith('authorized_at', { ascending: false });
    });

    it('該当行が無ければ空配列を返す', async () => {
      const query = createChainableMock([]);
      const { service } = createService(query);

      await expect(service.list(USER_ID)).resolves.toEqual([]);
    });

    it('取得エラーは McpConnectionsServiceError にする', async () => {
      const query = createChainableMock(null, { message: 'boom', code: 'PGRST000' });
      const { service } = createService(query);

      await expect(service.list(USER_ID)).rejects.toMatchObject({
        name: 'McpConnectionsServiceError',
        code: 'FETCH_FAILED',
        message: 'Failed to fetch MCP connections',
      });
    });
  });

  describe('revoke', () => {
    it('所有権を確認してから rpc を呼び、true なら成功する', async () => {
      const query = createChainableMock({ id: CONNECTION_ID });
      const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
      const { service, from } = createService(query, rpc);

      await expect(service.revoke(USER_ID, CONNECTION_ID)).resolves.toBeUndefined();
      expect(from).toHaveBeenCalledWith('oauth_connections');
      expect(query.eq).toHaveBeenCalledWith('id', CONNECTION_ID);
      expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
      expect(rpc).toHaveBeenCalledWith('revoke_oauth_connection', {
        p_connection_id: CONNECTION_ID,
      });
    });

    it('他人・存在しない connection は rpc を呼ばずに NOT_FOUND にする', async () => {
      const query = createChainableMock(null);
      const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
      const { service } = createService(query, rpc);

      await expect(service.revoke(USER_ID, CONNECTION_ID)).rejects.toMatchObject({
        name: 'McpConnectionsServiceError',
        code: 'NOT_FOUND',
        message: 'MCP connection not found',
      });
      // 所有権チェックで落ちるので DB 側の revoke には到達しない。
      expect(rpc).not.toHaveBeenCalled();
    });

    it('所有権確認は通ったが rpc が false を返せば NOT_FOUND にする', async () => {
      const query = createChainableMock({ id: CONNECTION_ID });
      const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
      const { service } = createService(query, rpc);

      await expect(service.revoke(USER_ID, CONNECTION_ID)).rejects.toBeInstanceOf(
        McpConnectionsServiceError,
      );
      await expect(service.revoke(USER_ID, CONNECTION_ID)).rejects.toMatchObject({
        name: 'McpConnectionsServiceError',
        code: 'NOT_FOUND',
        message: 'MCP connection not found',
      });
    });

    it('所有権確認のエラーは REVOKE_FAILED にする', async () => {
      const query = createChainableMock(null, { message: 'boom', code: 'PGRST000' });
      const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
      const { service } = createService(query, rpc);

      await expect(service.revoke(USER_ID, CONNECTION_ID)).rejects.toMatchObject({
        name: 'McpConnectionsServiceError',
        code: 'REVOKE_FAILED',
        message: 'Failed to revoke MCP connection',
      });
      expect(rpc).not.toHaveBeenCalled();
    });

    it('rpc がエラーを返せば REVOKE_FAILED にする', async () => {
      const query = createChainableMock({ id: CONNECTION_ID });
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
      const { service } = createService(query, rpc);

      await expect(service.revoke(USER_ID, CONNECTION_ID)).rejects.toMatchObject({
        name: 'McpConnectionsServiceError',
        code: 'REVOKE_FAILED',
        message: 'Failed to revoke MCP connection',
      });
    });
  });
});
