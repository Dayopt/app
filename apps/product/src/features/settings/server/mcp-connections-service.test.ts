import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';
import { createChainableMock } from '@/lib/test/trpc-test-helpers';

import { McpConnectionsService, McpConnectionsServiceError } from './mcp-connections-service';

const USER_ID = 'user-1';
const CONNECTION_ID = 'connection-1';
// mcp-connections-service.ts の MCP_LIST_PAGE_SIZE と同じ値。service 側の定数は
// re-export していないため、ページング境界を確かめるテストはここで固定する。
const PAGE_SIZE = 50;

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

/**
 * `id-{start}` .. `id-{start + count - 1}` の一意な connection 行を生成する。
 * `authorized_at` は行ごとに 1 秒ずつ古くする（先頭が最新 = DESC 順の並びを模す）。
 */
function buildRows(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${String(start + i).padStart(4, '0')}`,
    client_id: 'claude-ai',
    scopes: ['read:entries'],
    authorized_at: `2026-08-01T00:00:${String(99 - (start + i)).padStart(2, '0')}.000Z`,
    last_used_at: null,
  }));
}

describe('McpConnectionsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('自分の未 revoke connection を authorized_at 降順で明示カラムだけ取得する（cursor 未指定時は .or() を付けない）', async () => {
      const query = createChainableMock([connectionRow]);
      const { service, from } = createService(query);

      const result = await service.list(USER_ID);

      expect(result).toEqual({ items: [connectionRow], nextCursor: null });
      expect(from).toHaveBeenCalledWith('oauth_connections');
      expect(query.select).toHaveBeenCalledWith(
        'id, client_id, scopes, authorized_at, last_used_at',
      );
      expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
      expect(query.is).toHaveBeenCalledWith('revoked_at', null);
      expect(query.or).not.toHaveBeenCalled();
      expect(query.order).toHaveBeenCalledWith('authorized_at', { ascending: false });
      // `authorized_at` は一意でないため、tiebreaker が無いと同値行の並びが不定になり
      // cursor が指す位置が定まらない。全順序であることを固定する。
      expect(query.order).toHaveBeenCalledWith('id', { ascending: false });
      // 次ページの有無を判定するため page size + 1 件取る（N+1 trick）。
      expect(query.limit).toHaveBeenCalledWith(PAGE_SIZE + 1);
    });

    it('該当行が無ければ空配列を返す', async () => {
      const query = createChainableMock([]);
      const { service } = createService(query);

      await expect(service.list(USER_ID)).resolves.toEqual({ items: [], nextCursor: null });
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

    it('limit(page size + 1) で page size + 1 件目が返っても、items は page size 件に切り捨てて nextCursor を最終行の生値にする', async () => {
      const rows = buildRows(0, PAGE_SIZE + 1); // page size + 1 件（次ページありを示す N+1 trick）
      const query = createChainableMock(rows);
      const { service } = createService(query);

      const result = await service.list(USER_ID);

      expect(result.items).toHaveLength(PAGE_SIZE);
      expect(result.items.map((row) => row.id)).toEqual(
        rows.slice(0, PAGE_SIZE).map((row) => row.id),
      );
      const lastRow = rows[PAGE_SIZE - 1]!;
      // cursor は Date 変換を経由せず DB の生値と bit-for-bit 一致すること。
      expect(result.nextCursor).toEqual({ authorizedAt: lastRow.authorized_at, id: lastRow.id });
    });

    it('page size 未満で終われば nextCursor は null', async () => {
      const rows = buildRows(0, PAGE_SIZE - 1);
      const query = createChainableMock(rows);
      const { service } = createService(query);

      const result = await service.list(USER_ID);

      expect(result.items).toHaveLength(PAGE_SIZE - 1);
      expect(result.nextCursor).toBeNull();
    });

    it('cursor 指定時は (authorized_at, id) の複合比較を .or() で表現する', async () => {
      const rows = buildRows(1, 3);
      const query = createChainableMock(rows);
      const { service } = createService(query);
      const cursorId = '11111111-1111-1111-1111-111111111111';
      const cursor = { authorizedAt: '2026-08-01T00:00:50.123456Z', id: cursorId };

      await service.list(USER_ID, cursor);

      expect(query.or).toHaveBeenCalledWith(
        `authorized_at.lt.2026-08-01T00:00:50.123456Z,and(authorized_at.eq.2026-08-01T00:00:50.123456Z,id.lt.${cursorId})`,
      );
    });

    it('不正な cursor（timestamptz でない authorizedAt）は .or() を呼ばず INVALID_INPUT にする', async () => {
      const query = createChainableMock([]);
      const { service } = createService(query);

      await expect(
        service.list(USER_ID, {
          authorizedAt: 'not-a-date',
          id: '11111111-1111-1111-1111-111111111111',
        }),
      ).rejects.toMatchObject({ name: 'McpConnectionsServiceError', code: 'INVALID_INPUT' });
      expect(query.or).not.toHaveBeenCalled();
    });

    it('不正な cursor（uuid でない id）は INVALID_INPUT にする', async () => {
      const query = createChainableMock([]);
      const { service } = createService(query);

      await expect(
        service.list(USER_ID, {
          authorizedAt: '2026-08-01T00:00:00.000Z',
          id: '"); DROP TABLE oauth_connections; --',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('1 ページ目（cursor 未指定）が満杯（次ページあり）なら logger.warn を出す', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const rows = buildRows(0, PAGE_SIZE + 1);
      const query = createChainableMock(rows);
      const { service } = createService(query);

      await service.list(USER_ID);

      expect(warn).toHaveBeenCalledWith(
        'MCP connection list exceeded a single page',
        expect.objectContaining({
          feature: 'mcp_connections',
          operation: 'list_connections',
          pageSize: PAGE_SIZE,
        }),
      );
      warn.mockRestore();
    });

    it('1 ページ目が満杯でなければ logger.warn を出さない', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const query = createChainableMock([connectionRow]);
      const { service } = createService(query);

      await service.list(USER_ID);

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('2 ページ目以降（cursor 指定時）は満杯でも logger.warn を出さない', async () => {
      // count クエリを足さない設計なので、2 ページ目以降の蓄積規模は観測しない
      // （1 ページ目の warn だけで異常蓄積ユーザーを検知する）。
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const rows = buildRows(1, PAGE_SIZE + 1);
      const query = createChainableMock(rows);
      const { service } = createService(query);

      await service.list(USER_ID, {
        authorizedAt: '2026-08-01T00:01:00.000Z',
        id: '11111111-1111-1111-1111-111111111111',
      });

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
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
