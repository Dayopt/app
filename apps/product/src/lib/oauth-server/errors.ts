import 'server-only';

/**
 * Authorization server errors (RFC 6749) and protected-resource errors
 * (RFC 6750) used by the current OAuth surface.
 */
type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_response_type'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'invalid_target'
  | 'invalid_token'
  | 'access_denied'
  | 'server_error';

export class OAuthServerError extends Error {
  constructor(
    public readonly code: OAuthErrorCode,
    message: string,
    public readonly httpStatus = 400,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OAuthServerError';
  }
}
