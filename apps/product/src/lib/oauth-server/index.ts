/**
 * OAuth 2.1 Authorization Server barrel.
 * /authorize, /token endpoints, PKCE (S256), opaque token issue/verify, static client allowlist.
 *
 * See docs/projects/mcp-plan-track-learn/overview.md.
 */

export { validateAuthorizeInput, type AuthorizeValidationError } from './authorize-validation';
export { isClientWriteEnabled, resolveClient, type OAuthClientId } from './clients';
export { exchangeAuthorizationCode, refreshAccessToken } from './code-exchange';
export { createOAuthDbClient } from './db';
export { OAuthServerError } from './errors';
export {
  getCanonicalResourceUri,
  resolveRequestedResource,
  type CanonicalResourceUri,
} from './resource';
export { hasWriteScope, isSupportedScope, type SupportedScope, type WriteScope } from './scopes';
export { generateAuthorizationCode, hashToken } from './tokens';
