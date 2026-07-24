/**
 * OAuth 2.1 Authorization Server barrel.
 * /authorize, /token endpoints, PKCE (S256), opaque token issue/verify, static client allowlist.
 *
 * See docs/projects/mcp-plan-track-learn/overview.md.
 */

export { validateAuthorizeInput, type AuthorizeValidationError } from './authorize-validation';
export { isRuntimeClientWriteEnabled, resolveClient, type OAuthClientId } from './clients';
export { exchangeAuthorizationCode, refreshAccessToken } from './code-exchange';
export { createOAuthDbClient } from './db';
export { OAuthServerError } from './errors';
export { resolveRequestedResource, type CanonicalResourceUri } from './resource';
export {
  ADVERTISED_SCOPES,
  DEFAULT_SCOPES,
  hasWriteScope,
  isSupportedScope,
  type SupportedScope,
} from './scopes';
export { generateAuthorizationCode, hashToken } from './tokens';
