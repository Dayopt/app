import 'server-only';

/**
 * Phase 1 static client allowlist.
 * Phase 2 で DCR (Dynamic Client Registration) に置換し、`oauth_clients` テーブル管理に移行する。
 *
 * client_id は DB CHECK 制約と一致 (017_tables_oauth.sql)。
 */
export type OAuthClientId = 'claude-ai' | 'chatgpt' | 'cursor' | 'unknown';

export interface OAuthClient {
  id: OAuthClientId;
  displayName: string;
  redirectUriPatterns: RegExp[];
}

const CLIENTS: Record<OAuthClientId, OAuthClient> = {
  'claude-ai': {
    id: 'claude-ai',
    displayName: 'Claude',
    redirectUriPatterns: [/^https:\/\/claude\.ai\/api\/mcp\/auth_callback$/],
  },
  chatgpt: {
    id: 'chatgpt',
    displayName: 'ChatGPT',
    redirectUriPatterns: [/^https:\/\/chatgpt\.com\/.*$/, /^https:\/\/chat\.openai\.com\/.*$/],
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor',
    redirectUriPatterns: [/^https:\/\/cursor\.com\/.*$/, /^cursor:\/\/.*$/],
  },
  unknown: {
    id: 'unknown',
    displayName: 'Unknown client',
    redirectUriPatterns: [/^https:\/\/[^/]+\/.*$/],
  },
};

export function resolveClient(clientId: string | null | undefined): OAuthClient | null {
  if (!clientId) return null;
  if (clientId in CLIENTS) {
    return CLIENTS[clientId as OAuthClientId];
  }
  return null;
}

export function isAllowedRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  return client.redirectUriPatterns.some((p) => p.test(redirectUri));
}
