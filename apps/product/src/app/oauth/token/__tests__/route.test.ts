import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { POST as compatPost } from '@/app/api/oauth/token/route';

import { POST, dynamic } from '../route';

function createTokenRequest(url: string) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code' }).toString(),
  });
}

describe('canonical /oauth/token filesystem route', () => {
  it('shares the exact compat handler so both paths keep one contract', () => {
    // filesystem route 化で rewrite を外しても、`/api/oauth/token` 互換 path と
    // 実装が分岐しないことを固定する。
    expect(POST).toBe(compatPost);
    expect(dynamic).toBe('force-dynamic');
  });

  it('rejects the MCP host now that the path resolves on every host', async () => {
    // rewrite 時代は mcp host に path 自体が無かった。filesystem route 化後は
    // handler 内の rejectUnexpectedOAuthHost が host 分離を担う。
    const response = await POST(createTokenRequest('https://mcp.dayopt.app/oauth/token'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
  });
});
