import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

const ACCESS_PREFIX = 'dop_at_';
const REFRESH_PREFIX = 'dop_rt_';

/** Bytes of entropy for tokens / codes (= 256 bits). */
const ENTROPY_BYTES = 32;

export type TokenType = 'access' | 'refresh';

export interface IssuedToken {
  /** Plain token shown to client once (DB stores only the hash). */
  token: string;
  /** SHA-256 hex digest stored in oauth_tokens.token_hash. */
  hash: string;
}

export function generateOpaqueToken(type: TokenType): IssuedToken {
  const random = randomBytes(ENTROPY_BYTES).toString('base64url');
  const prefix = type === 'access' ? ACCESS_PREFIX : REFRESH_PREFIX;
  const token = `${prefix}${random}`;
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssuedAuthorizationCode {
  /** Plain code returned to redirect_uri. */
  code: string;
  /** SHA-256 hex digest stored in oauth_authorization_codes.code_hash. */
  hash: string;
}

export function generateAuthorizationCode(): IssuedAuthorizationCode {
  const code = randomBytes(ENTROPY_BYTES).toString('base64url');
  return { code, hash: hashToken(code) };
}

/**
 * RFC 7636 §4.6 PKCE S256 verification:
 *   challenge === BASE64URL(SHA256(verifier))
 */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier).digest('base64url');
  return computed === challenge;
}
