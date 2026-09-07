import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/env', () => ({
  env: {
    OAUTH_CLAUDE_REDIRECT_URIS: undefined,
    OAUTH_CHATGPT_REDIRECT_URIS: undefined,
    OAUTH_CURSOR_REDIRECT_URIS: undefined,
    MCP_WRITE_ENABLED_CLIENTS: undefined,
  },
}));

import { resolveClient } from './clients';

describe('resolveClient', () => {
  it.each(['claude-ai', 'chatgpt', 'cursor'])('既知の client %s を解決する', (clientId) => {
    const client = resolveClient(clientId);

    expect(client?.id).toBe(clientId);
    expect(client?.redirectUris.length).toBeGreaterThan(0);
  });

  it.each([null, undefined, '', 'unknown', 'dayopt'])(
    '未知の client_id (%s) は null を返す',
    (clientId) => {
      expect(resolveClient(clientId)).toBeNull();
    },
  );

  // claude-security スキャン F4 (LOW, 2/3)。
  //
  // allowlist 判定が `clientId in CLIENTS` だと prototype chain を辿るため、
  // これらの名前が「既知の client」として通り、直後の
  // `[...DEFAULT_REDIRECT_URIS[id]]` が iterable でない値（Object の
  // constructor 関数など）に当たって TypeError になっていた。
  // client_id は未認証の POST /oauth/token の form body から来るので、
  // 本来の invalid_client(400) が 500 server_error + Sentry の
  // unexpected error に化ける。null を返すことを固定する。
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf'])(
    'prototype chain の名前 %s は既知の client として通らない',
    (clientId) => {
      expect(() => resolveClient(clientId)).not.toThrow();
      expect(resolveClient(clientId)).toBeNull();
    },
  );
});
