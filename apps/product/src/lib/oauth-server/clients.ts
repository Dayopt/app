import 'server-only';

import { env } from '@/env';

/**
 * Phase 1 static client allowlist。
 * Phase 2 で DCR (Dynamic Client Registration) に置換し、`oauth_clients` テーブル管理に移行する。
 *
 * client_id は DB CHECK 制約と一致 (017_tables_oauth.sql)。`unknown` は DB 制約には残すが
 * runtime allowlist には**含めない** — wildcard redirect_uri を許可すると open client
 * onboarding になり、任意の attacker-controlled HTTPS domain に code が渡る穴ができるため。
 */
export type OAuthClientId = 'claude-ai' | 'chatgpt' | 'cursor';

export interface OAuthClient {
  id: OAuthClientId;
  displayName: string;
  redirectUris: readonly string[];
}

const DEFAULT_REDIRECT_URIS: Record<OAuthClientId, readonly string[]> = {
  'claude-ai': ['https://claude.ai/api/mcp/auth_callback'],
  chatgpt: ['https://chatgpt.com/connector_platform_oauth_redirect'],
  cursor: ['cursor://anysphere.cursor-mcp/oauth/callback'],
};

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

function parseExtraRedirectUris(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((uri) => uri.trim())
    .filter(Boolean);
}

export function resolveClient(clientId: string | null | undefined): OAuthClient | null {
  if (!clientId) return null;
  if (clientId in CLIENTS) {
    const id = clientId as OAuthClientId;
    return {
      ...CLIENTS[id],
      redirectUris: [
        ...DEFAULT_REDIRECT_URIS[id],
        ...parseExtraRedirectUris(env[EXTRA_REDIRECT_URI_ENV[id]]),
      ],
    };
  }
  return null;
}

export function isAllowedRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}
