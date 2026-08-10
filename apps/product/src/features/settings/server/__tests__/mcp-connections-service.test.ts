import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';
import { createChainableMock } from '@/lib/test/trpc-test-helpers';

import { McpConnectionsService, McpConnectionsServiceError } from '../mcp-connections-service';

const USER_ID = 'user-1';
const CONNECTION_ID = 'connection-1';
// mcp-connections-service.ts の MCP_LIST_PAGE_SIZE / MCP_LIST_MAX_PAGES と同じ値。
// service 側の定数は re-export していないため、ページング境界を確かめるテストは
// この値をここで固定する。
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

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

/** `id-{start}` .. `id-{start + count - 1}` の一意な connection 行を生成する。 */
function buildRows(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${start + i}`,
    client_id: 'claude-ai',
    scopes: ['read:entries'],
    authorized_at: `2026-08-01T00:00:${String(start + i).padStart(2, '0')}.000Z`,
    last_used_at: null,
  }));
}

/**
 * ページごとに異なる `{ data, count }` を返す chainable mock。
 * `list()` はページごとに新しいクエリチェーンを組むが、テスト側の `from` は
 * 同じクエリオブジェクトを使い回す（`createService` 参照）ため、`.then()` の
 * 呼び出し回数でページを進める。
 */
function createPagedChainableMock(pages: Array<{ data: unknown[]; count: number | null }>) {
  const query = createChainableMock(pages[0]?.data ?? []);
  let call = 0;
  query.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => {
    const page = pages[Math.min(call, pages.length - 1)];
    call += 1;
    resolve({ data: page?.data ?? [], count: page?.count ?? null, error: null });
  });
  return query;
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
        {
          count: 'exact',
        },
      );
      expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
      expect(query.is).toHaveBeenCalledWith('revoked_at', null);
      expect(query.order).toHaveBeenCalledWith('authorized_at', { ascending: false });
      // `authorized_at` は一意でないため、tiebreaker が無いと offset ページングで
      // page 境界の tie が入れ替わり行を取りこぼす。全順序であることを固定する。
      expect(query.order).toHaveBeenCalledWith('id', { ascending: false });
      expect(query.range).toHaveBeenCalledWith(0, PAGE_SIZE - 1);
      // count が page size を下回れば 1 回の select で終わる。
      expect(from).toHaveBeenCalledOnce();
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

    it('count が null の場合でも壊れずに取得済み分を返す', async () => {
      const rows = buildRows(0, 3);
      const query = createPagedChainableMock([{ data: rows, count: null }]);
      const { service } = createService(query);

      await expect(service.list(USER_ID)).resolves.toEqual(rows);
    });

    it('count が page size を超えるとき、複数ページを取得して全件返す', async () => {
      const page1 = buildRows(0, PAGE_SIZE);
      const page2 = buildRows(PAGE_SIZE, 500);
      const query = createPagedChainableMock([
        { data: page1, count: PAGE_SIZE + 500 },
        { data: page2, count: PAGE_SIZE + 500 },
      ]);
      const { service } = createService(query);

      const result = await service.list(USER_ID);

      expect(result).toHaveLength(PAGE_SIZE + 500);
      expect(result.map((row) => row.id)).toEqual([...page1, ...page2].map((row) => row.id));
      expect(query.range).toHaveBeenNthCalledWith(1, 0, PAGE_SIZE - 1);
      expect(query.range).toHaveBeenNthCalledWith(2, PAGE_SIZE, 2 * PAGE_SIZE - 1);
    });

    it('重複で件数が水増しされても、総数に達するまでページを進める', async () => {
      // 重複込みの累計で総数判定すると「取得済み」が水増しされ、未取得の行を残したまま
      // break する（= 見えない connection が残り revoke できない）。dedupe 後の件数で
      // 判定していることを固定する。
      const page1 = buildRows(0, PAGE_SIZE); // id-0 .. id-999
      // page2 は半分が page1 との重複。重複込みなら 2000 件で総数 1500 を超えるが、
      // 一意な件数は 1500 に届いていない。
      const page2 = [...page1.slice(0, PAGE_SIZE / 2), ...buildRows(PAGE_SIZE, PAGE_SIZE / 2)];
      const page3 = buildRows(PAGE_SIZE + PAGE_SIZE / 2, 500);
      const total = PAGE_SIZE + PAGE_SIZE / 2 + 500;
      const query = createPagedChainableMock([
        { data: page1, count: total },
        { data: page2, count: total },
        { data: page3, count: total },
      ]);
      const { service } = createService(query);

      const result = await service.list(USER_ID);

      expect(query.range).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(total);
      expect(new Set(result.map((row) => row.id)).size).toBe(total);
    });

    it('サーバー側 row cap が page size より小さくても全件取得する', async () => {
      // production の PostgREST row cap は repo からは検証できない（supabase/config.toml は
      // local stack の設定）。cap が page size 未満だと 1 ページの返却が要求より少なくなる。
      // ここで「短いページ = 最終ページ」と決め打つと、要求したのに返らなかった範囲を
      // offset ごと飛ばして silent に切り捨てる（#1903 と同じ故障の別経路）。
      const serverCap = 400;
      const total = 1_000;
      const all = buildRows(0, total);
      const pages = [
        { data: all.slice(0, serverCap), count: total },
        { data: all.slice(serverCap, serverCap * 2), count: total },
        { data: all.slice(serverCap * 2, total), count: total },
      ];
      const query = createPagedChainableMock(pages);
      const { service } = createService(query);

      const result = await service.list(USER_ID);

      expect(result).toHaveLength(total);
      expect(result.map((row) => row.id)).toEqual(all.map((row) => row.id));
      // offset は「要求した件数」ではなく「実際に受け取った件数」で進む。
      expect(query.range).toHaveBeenNthCalledWith(1, 0, PAGE_SIZE - 1);
      expect(query.range).toHaveBeenNthCalledWith(2, serverCap, serverCap + PAGE_SIZE - 1);
      expect(query.range).toHaveBeenNthCalledWith(3, serverCap * 2, serverCap * 2 + PAGE_SIZE - 1);
    });

    it('総数へ届かないまま終わったら logger.warn で可視化する', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      // 並行 revoke などで count（総数）に届かないまま 0 件ページに当たるケース。
      // cap 未到達でも silent に返さない。
      const query = createPagedChainableMock([
        { data: buildRows(0, 3), count: 10 },
        { data: [], count: 10 },
      ]);
      const { service } = createService(query);

      const result = await service.list(USER_ID);

      expect(result).toHaveLength(3);
      expect(warn).toHaveBeenCalledWith(
        'MCP connection list did not reach the reported total',
        expect.objectContaining({ returned: 3, total: 10, cappedByPageLimit: false }),
      );
      warn.mockRestore();
    });

    it('ページを跨いで重複した id は dedupe される', async () => {
      // 並行 INSERT で offset がずれ、page2 の先頭に page1 最終行と同じ id が
      // 再度現れるケースを模す。
      const page1 = buildRows(0, PAGE_SIZE); // id-0 .. id-999
      const overlappingRow = page1[page1.length - 1]!;
      const newRow = buildRows(PAGE_SIZE, 1)[0]!; // id-1000
      const page2 = [overlappingRow, newRow];
      const query = createPagedChainableMock([
        { data: page1, count: PAGE_SIZE + 1 },
        { data: page2, count: PAGE_SIZE + 1 },
      ]);
      const { service } = createService(query);

      const result = await service.list(USER_ID);

      expect(result).toHaveLength(PAGE_SIZE + 1);
      const ids = result.map((row) => row.id);
      expect(new Set(ids).size).toBe(ids.length); // 重複なし
      expect(ids.filter((id) => id === overlappingRow.id)).toHaveLength(1);
      expect(ids).toContain(newRow.id);
    });

    it('cap に到達したら logger.warn を出しつつ取得済み分をそのまま返す', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const pages = Array.from({ length: MAX_PAGES }, (_, page) => ({
        data: buildRows(page * PAGE_SIZE, PAGE_SIZE),
        // 総数は cap（MAX_PAGES * PAGE_SIZE）よりずっと多い＝cap まで取っても届かない。
        count: MAX_PAGES * PAGE_SIZE * 2,
      }));
      const query = createPagedChainableMock(pages);
      const { service } = createService(query);

      const result = await service.list(USER_ID);

      expect(result).toHaveLength(MAX_PAGES * PAGE_SIZE);
      expect(query.range).toHaveBeenCalledTimes(MAX_PAGES);
      expect(warn).toHaveBeenCalledWith(
        'MCP connection list did not reach the reported total',
        expect.objectContaining({
          feature: 'mcp_connections',
          operation: 'list_connections',
          returned: MAX_PAGES * PAGE_SIZE,
          total: MAX_PAGES * PAGE_SIZE * 2,
          cap: MAX_PAGES * PAGE_SIZE,
        }),
      );
    });

    it('cap に到達しなければ logger.warn を出さない', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const query = createPagedChainableMock([{ data: [connectionRow], count: 1 }]);
      const { service } = createService(query);

      await service.list(USER_ID);

      expect(warn).not.toHaveBeenCalled();
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
