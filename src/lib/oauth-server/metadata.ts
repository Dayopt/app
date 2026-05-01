import 'server-only';

import { getAppUrl } from '@/lib/app-url';

import { SUPPORTED_SCOPES } from './scopes';

const MCP_RESOURCE_URL = 'https://mcp.dayopt.app';

/**
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata
 * https://datatracker.ietf.org/doc/html/rfc8414
 */
export function buildAuthorizationServerMetadata() {
  const issuer = getAppUrl();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    /** Phase 1 は public client のみ (PKCE required, no client secret). */
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...SUPPORTED_SCOPES],
  } as const;
}

/**
 * RFC 9728 - OAuth 2.0 Protected Resource Metadata
 * https://datatracker.ietf.org/doc/html/rfc9728
 */
export function buildProtectedResourceMetadata() {
  return {
    resource: MCP_RESOURCE_URL,
    authorization_servers: [getAppUrl()],
    bearer_methods_supported: ['header'],
    scopes_supported: [...SUPPORTED_SCOPES],
  } as const;
}
