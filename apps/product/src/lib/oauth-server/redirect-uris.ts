export type OAuthClientId = 'claude-ai' | 'chatgpt' | 'cursor';

export const DEFAULT_REDIRECT_URIS: Record<OAuthClientId, readonly string[]> = {
  'claude-ai': ['https://claude.ai/api/mcp/auth_callback'],
  chatgpt: ['https://chatgpt.com/connector_platform_oauth_redirect'],
  cursor: ['cursor://anysphere.cursor-mcp/oauth/callback'],
};

function hasForbiddenUrlParts(url: URL): boolean {
  return Boolean(url.username || url.password || url.port || url.search || url.hash);
}

export function isValidOAuthRedirectUri(clientId: OAuthClientId, value: string): boolean {
  if (value.includes('*')) return false;

  try {
    const url = new URL(value);
    if (url.href !== value) return false;
    if (hasForbiddenUrlParts(url)) return false;

    switch (clientId) {
      case 'claude-ai':
        return (
          url.protocol === 'https:' &&
          url.hostname === 'claude.ai' &&
          url.pathname === '/api/mcp/auth_callback'
        );
      case 'chatgpt':
        return (
          url.protocol === 'https:' &&
          url.hostname === 'chatgpt.com' &&
          (url.pathname === '/connector_platform_oauth_redirect' ||
            /^\/connector\/oauth\/[A-Za-z0-9._~-]+$/.test(url.pathname))
        );
      case 'cursor':
        return (
          url.protocol === 'cursor:' &&
          url.hostname === 'anysphere.cursor-mcp' &&
          url.pathname === '/oauth/callback'
        );
    }
  } catch {
    return false;
  }
}

export function parseValidOAuthRedirectUriList(
  clientId: OAuthClientId,
  value: string | undefined,
): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((uri) => uri.trim())
    .filter(Boolean)
    .filter((uri) => isValidOAuthRedirectUri(clientId, uri));
}

export function isValidOAuthRedirectUriList(
  clientId: OAuthClientId,
  value: string | undefined,
): boolean {
  if (!value) return true;

  const configured = value
    .split(',')
    .map((uri) => uri.trim())
    .filter(Boolean);

  return configured.length > 0 && configured.every((uri) => isValidOAuthRedirectUri(clientId, uri));
}
