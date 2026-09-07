import 'server-only';

import { env } from '@/env';

import {
  DEFAULT_REDIRECT_URIS,
  parseValidOAuthRedirectUriList,
  type OAuthClientId,
} from './redirect-uris';

/**
 * Phase 1 static client allowlist。
 * Phase 2 で DCR (Dynamic Client Registration) に置換し、`oauth_clients` テーブル管理に移行する。
 *
 * client_id は DB CHECK 制約と一致 (017_tables_oauth.sql)。`unknown` は DB 制約には残すが
 * runtime allowlist には**含めない** — wildcard redirect_uri を許可すると open client
 * onboarding になり、任意の attacker-controlled HTTPS domain に code が渡る穴ができるため。
 */
export type { OAuthClientId } from './redirect-uris';

export interface OAuthClient {
  id: OAuthClientId;
  displayName: string;
  redirectUris: readonly string[];
}

const EXTRA_REDIRECT_URI_ENV: Record<OAuthClientId, keyof typeof env> = {
  'claude-ai': 'OAUTH_CLAUDE_REDIRECT_URIS',
  chatgpt: 'OAUTH_CHATGPT_REDIRECT_URIS',
  cursor: 'OAUTH_CURSOR_REDIRECT_URIS',
};

const CLIENTS: Record<OAuthClientId, Omit<OAuthClient, 'redirectUris'>> = {
  'claude-ai': {
    id: 'claude-ai',
    displayName: 'Claude',
  },
  chatgpt: {
    id: 'chatgpt',
    displayName: 'ChatGPT',
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor',
  },
};

export function resolveClient(clientId: string | null | undefined): OAuthClient | null {
  if (!clientId) return null;
  // `in` ではなく own-property で判定する。`in` は prototype chain を辿るため
  // `constructor` / `toString` / `valueOf` / `hasOwnProperty` / `__proto__` が
  // 「既知の client」として通り、直後の `DEFAULT_REDIRECT_URIS[id]` の spread が
  // iterable でない値に当たって TypeError になる。client_id は未認証の
  // POST /oauth/token の form body から来る完全な attacker 入力なので、本来の
  // `invalid_client`(400) が 500 `server_error` + Sentry の unexpected error に
  // 化ける（token も code も発行されないが、意図した拒否が内部エラーに変わる）。
  if (Object.hasOwn(CLIENTS, clientId)) {
    const id = clientId as OAuthClientId;
    return {
      ...CLIENTS[id],
      redirectUris: [
        ...DEFAULT_REDIRECT_URIS[id],
        ...parseValidOAuthRedirectUriList(id, env[EXTRA_REDIRECT_URI_ENV[id]]),
      ],
    };
  }
  return null;
}

export function isAllowedRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

/**
 * Write scopes are a closed-beta capability. Client IDs are public identifiers,
 * so this is a product rollout gate rather than client authentication.
 */
export function isRuntimeClientWriteEnabled(clientId: OAuthClientId): boolean {
  const configured = env.MCP_WRITE_ENABLED_CLIENTS;
  if (!configured) return false;

  return configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(clientId);
}
