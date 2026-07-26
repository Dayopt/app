import 'server-only';

import { getOAuthEnvironmentConfig } from './identity-env';
import { normalizeHttpsOrigin, type CanonicalResourceUri } from './origin';

export type { CanonicalResourceUri } from './origin';

/**
 * Dayopt MCP uses one origin-level OAuth resource identity. `/mcp` and
 * `/api/mcp` are transport aliases, not separate protected resources.
 */
function getCanonicalResourceUri(): CanonicalResourceUri {
  return getOAuthEnvironmentConfig().resourceUri;
}

/**
 * Parse and normalize an OAuth resource identifier before comparison.
 *
 * URL parsing canonicalizes scheme/host case and removes default port 443.
 * Empty path and `/` are the same origin identity. Userinfo, query, fragment,
 * non-default ports, and transport paths are deliberately rejected.
 */
export function normalizeResourceUri(value: string): CanonicalResourceUri | null {
  return normalizeHttpsOrigin(value) as CanonicalResourceUri | null;
}

export function resolveRequestedResource(
  value: string | null | undefined,
): CanonicalResourceUri | null {
  if (!value) return null;
  const normalized = normalizeResourceUri(value);
  return normalized === getCanonicalResourceUri() ? normalized : null;
}
