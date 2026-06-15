/**
 * OAuth 2.1 Authorization Server barrel.
 * /authorize, /token endpoints, PKCE (S256), opaque token issue/verify, static client allowlist.
 *
 * See docs/projects/mcp-server/overview.md (Decision 1, 9).
 */

export { validateAuthorizeInput, type AuthorizeValidationError } from './authorize-validation';
export { resolveClient, type OAuthClientId } from './clients';
export { exchangeAuthorizationCode, refreshAccessToken } from './code-exchange';
export { createOAuthDbClient } from './db';
export { OAuthServerError } from './errors';
export { type SupportedScope } from './scopes';
export { generateAuthorizationCode, hashToken } from './tokens';
