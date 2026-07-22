import 'server-only';

import { dayoptUrls } from '@dayopt/config';

import { env } from '@/env';

export type CanonicalResourceUri = string & { readonly __canonicalResourceUri: unique symbol };

const FALLBACK_RESOURCE_URI = dayoptUrls.mcp;

/**
 * Dayopt MCP uses one origin-level OAuth resource identity. `/mcp` and
 * `/api/mcp` are transport aliases, not separate protected resources.
 */
export function getCanonicalResourceUri(): CanonicalResourceUri {
  const configured = env.MCP_CANONICAL_RESOURCE_URI ?? FALLBACK_RESOURCE_URI;
  const normalized = normalizeResourceUri(configured);

  if (!normalized || normalized !== FALLBACK_RESOURCE_URI) {
    throw new Error('MCP_CANONICAL_RESOURCE_URI must resolve to https://mcp.dayopt.app');
  }

  return normalized;
}

/**
 * Parse and normalize an OAuth resource identifier before comparison.
 *
 * URL parsing canonicalizes scheme/host case and removes default port 443.
 * Empty path and `/` are the same origin identity. Userinfo, query, fragment,
 * non-default ports, and transport paths are deliberately rejected.
 */
export function normalizeResourceUri(value: string): CanonicalResourceUri | null {
  let resource: URL;
  try {
    resource = new URL(value);
  } catch {
    return null;
  }

  if (
    resource.protocol !== 'https:' ||
    resource.username !== '' ||
    resource.password !== '' ||
    resource.search !== '' ||
    resource.hash !== '' ||
    (resource.port !== '' && resource.port !== '443') ||
    (resource.pathname !== '' && resource.pathname !== '/')
  ) {
    return null;
  }

  return `https://${resource.hostname.toLowerCase()}` as CanonicalResourceUri;
}

export function resolveRequestedResource(
  value: string | null | undefined,
): CanonicalResourceUri | null {
  if (!value) return null;
  const normalized = normalizeResourceUri(value);
  return normalized === getCanonicalResourceUri() ? normalized : null;
}
