import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

const ACCESS_PREFIX = 'dop_at_';
const REFRESH_PREFIX = 'dop_rt_';

/** Bytes of entropy for tokens / codes (= 256 bits). */
const ENTROPY_BYTES = 32;

type TokenType = 'access' | 'refresh';

interface IssuedToken {
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

interface IssuedAuthorizationCode {
  /** Plain code returned to redirect_uri. */
  code: string;
  /** SHA-256 hex digest stored in oauth_authorization_codes.code_hash. */
  hash: string;
}

export function generateAuthorizationCode(): IssuedAuthorizationCode {
  const code = randomBytes(ENTROPY_BYTES).toString('base64url');
  return { code, hash: hashToken(code) };
}

export function derivePkceS256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** RFC 7636 section 4.1: 43-128 unreserved ASCII characters. */
export function isValidPkceVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}
