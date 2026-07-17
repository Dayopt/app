import 'server-only';

/**
 * RFC 6749 §4.1.2.1 / §5.2 で規定された OAuth エラーコード。
 * Phase 1 で必要なものに絞っている。
 */
type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_response_type'
  | 'unsupported_grant_type'
  | 'invalid_scope'
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
