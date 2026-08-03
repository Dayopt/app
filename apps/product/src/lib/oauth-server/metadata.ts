import 'server-only';

import { getOAuthEnvironmentConfig } from './identity-env';
import { ADVERTISED_SCOPES } from './scopes';

/**
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata
 * https://datatracker.ietf.org/doc/html/rfc8414
 */
export function buildAuthorizationServerMetadata() {
  const { authorizationEndpoint, authorizationServerUri, tokenEndpoint } =
    getOAuthEnvironmentConfig();
  return {
    issuer: authorizationServerUri,
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    /** Phase 1 は public client のみ (PKCE required, no client secret). */
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...ADVERTISED_SCOPES],
  } as const;
}

/**
 * RFC 9728 - OAuth 2.0 Protected Resource Metadata
 * https://datatracker.ietf.org/doc/html/rfc9728
 */
export function buildProtectedResourceMetadata() {
  const { authorizationServerUri, resourceUri } = getOAuthEnvironmentConfig();
  return {
    resource: resourceUri,
    authorization_servers: [authorizationServerUri],
    bearer_methods_supported: ['header'],
    scopes_supported: [...ADVERTISED_SCOPES],
  } as const;
}
