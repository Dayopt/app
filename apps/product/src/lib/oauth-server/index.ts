/**
 * OAuth 2.1 Authorization Server barrel.
 * /authorize, /token endpoints, PKCE (S256), opaque token issue/verify, static client allowlist.
 *
 * See docs/design/mcp-server/overview.md (Decision 1, 9).
 */

export {
  validateAuthorizeInput,
  type AuthorizeInput,
  type AuthorizeValidationError,
  type AuthorizeValidationResult,
} from './authorize-validation';
export {
  isAllowedRedirectUri,
  resolveClient,
  type OAuthClient,
  type OAuthClientId,
} from './clients';
export {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  exchangeAuthorizationCode,
  refreshAccessToken,
  type ExchangeAuthorizationCodeInput,
  type RefreshAccessTokenInput,
  type TokenResponse,
} from './code-exchange';
export { createOAuthDbClient, type OAuthSupabaseClient } from './db';
export { OAuthServerError, type OAuthErrorCode } from './errors';
export { buildAuthorizationServerMetadata, buildProtectedResourceMetadata } from './metadata';
export {
  DEFAULT_SCOPES,
  SUPPORTED_SCOPES,
  parseRequestedScope,
  type SupportedScope,
} from './scopes';
export {
  generateAuthorizationCode,
  generateOpaqueToken,
  hashToken,
  verifyPkceS256,
  type IssuedAuthorizationCode,
  type IssuedToken,
  type TokenType,
} from './tokens';
