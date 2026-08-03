import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { DELETE as apiDelete, GET as apiGet, POST as apiPost } from '@/app/api/mcp/route';

import { DELETE, GET, POST, dynamic } from '../route';

function createMcpRequest(url: string) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
  });
}

describe('canonical /mcp filesystem route', () => {
  it('shares the exact /api/mcp handlers so both paths keep one contract', () => {
    // filesystem route 化で rewrite に依存しなくなっても、`/api/mcp` と
    // 実装が分岐しないことを固定する。
    expect(POST).toBe(apiPost);
    expect(GET).toBe(apiGet);
    expect(DELETE).toBe(apiDelete);
    expect(dynamic).toBe('force-dynamic');
  });

  it('rejects the Product app host now that the path resolves on every host', async () => {
    // production では resource surface は mcp.dayopt.app だけが所有する。
    // app host の `/mcp` は rejectUnexpectedOAuthHost が 404 で閉じる。
    const response = await POST(createMcpRequest('https://app.dayopt.app/mcp'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
  });
});
