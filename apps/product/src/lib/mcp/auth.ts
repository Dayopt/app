import 'server-only';

import { logger } from '@/lib/logger';
import {
  OAuthServerError,
  createOAuthDbClient,
  hashToken,
  type OAuthClientId,
  type SupportedScope,
} from '@/lib/oauth-server';
import { databaseTables } from '@dayopt/database';

interface VerifiedAccessToken {
  /** oauth_tokens.id (chain 追跡用)。 */
  tokenId: string;
  /** Dayopt user (auth.users.id)。tRPC service 層で `ctx.userId` として使う。 */
  userId: string;
  clientId: OAuthClientId;
  scopes: SupportedScope[];
  /** Unix epoch seconds, AuthInfo 形式に揃える。 */
  expiresAt: number;
}

/**
 * MCP 受信時の Bearer token 検証。
 *
 * Token は opaque (`dop_at_*`)。SHA-256 hash で oauth_tokens を引き、
 * - token_type === 'access'
 * - revoked_at IS NULL
 * - expires_at > now
 * を確認する。Phase 1 は per-request DB lookup でシンプルに保つ (in-process cache なし)。
 */
export async function verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
  const tokenHash = hashToken(token);
  const db = createOAuthDbClient();

  const { data: row, error } = await db
    .from(databaseTables.oauthTokens)
    .select('id, user_id, token_type, client_id, scopes, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    throw new OAuthServerError('server_error', error.message, 500);
  }
  if (!row) {
    throw new OAuthServerError('invalid_grant', 'Access token not found', 401);
  }
  if (row.token_type !== 'access') {
    throw new OAuthServerError('invalid_grant', 'Token is not an access token', 401);
  }
  if (row.revoked_at) {
    throw new OAuthServerError('invalid_grant', 'Token revoked', 401);
  }
  const expiresAtMs = new Date(row.expires_at).getTime();
  if (expiresAtMs < Date.now()) {
    throw new OAuthServerError('invalid_grant', 'Token expired', 401);
  }

  // last_used_at update — best effort, fire-and-forget
  void db
    .from(databaseTables.oauthTokens)
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(({ error: updateError }) => {
      if (updateError) {
        logger.warn({ err: updateError }, '[mcp] failed to update last_used_at');
      }
    });

  return {
    tokenId: row.id,
    userId: row.user_id,
    // DB の client_id / scopes は CHECK 制約と app 側 insert で narrow に保たれているため
    // cast で narrow して返す (Phase 1 の `unknown` 廃止後は claude-ai/chatgpt/cursor のみ)
    clientId: row.client_id as OAuthClientId,
    scopes: row.scopes as SupportedScope[],
    expiresAt: Math.floor(expiresAtMs / 1000),
  };
}

export function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) {
    throw new OAuthServerError('invalid_grant', 'Missing Authorization header', 401);
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new OAuthServerError(
      'invalid_grant',
      'Authorization header must be "Bearer <token>"',
      401,
    );
  }
  return match[1];
}
