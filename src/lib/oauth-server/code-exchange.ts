import 'server-only';

import { createOAuthDbClient } from './db';
import { OAuthServerError } from './errors';
import { generateOpaqueToken, hashToken, verifyPkceS256 } from './tokens';

/** Phase 1 token TTLs (Decision 1). */
export const ACCESS_TOKEN_TTL_SEC = 300; // 5 min
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 day

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface ExchangeAuthorizationCodeInput {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_verifier: string;
}

/**
 * authorization_code grant の交換処理。
 *
 * 1. code_hash で oauth_authorization_codes を引く
 * 2. consumed / expired / client_id / redirect_uri / PKCE を検証
 * 3. consumed_at を立てて single-use にする
 * 4. access + refresh を発行 (refresh の id を access の parent_token_id に保持)
 */
export async function exchangeAuthorizationCode(
  input: ExchangeAuthorizationCodeInput,
): Promise<TokenResponse> {
  const codeHash = hashToken(input.code);
  const db = createOAuthDbClient();

  const { data: row, error: lookupError } = await db
    .from('oauth_authorization_codes')
    .select('*')
    .eq('code_hash', codeHash)
    .maybeSingle();

  if (lookupError) {
    throw new OAuthServerError('server_error', lookupError.message, 500);
  }
  if (!row) {
    throw new OAuthServerError('invalid_grant', 'Authorization code not found');
  }
  if (row.consumed_at) {
    throw new OAuthServerError('invalid_grant', 'Authorization code already used');
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new OAuthServerError('invalid_grant', 'Authorization code expired');
  }
  if (row.client_id !== input.client_id) {
    throw new OAuthServerError('invalid_grant', 'client_id mismatch');
  }
  if (row.redirect_uri !== input.redirect_uri) {
    throw new OAuthServerError('invalid_grant', 'redirect_uri mismatch');
  }
  if (!verifyPkceS256(input.code_verifier, row.code_challenge)) {
    throw new OAuthServerError('invalid_grant', 'PKCE verification failed');
  }

  const { error: consumeError } = await db
    .from('oauth_authorization_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('code_hash', codeHash);
  if (consumeError) {
    throw new OAuthServerError('server_error', consumeError.message, 500);
  }

  return issueTokenPair({
    userId: row.user_id,
    clientId: row.client_id,
    scopes: row.scopes,
    parentRefreshTokenId: null,
  });
}

export interface RefreshAccessTokenInput {
  refresh_token: string;
  client_id: string;
}

/**
 * refresh_token grant 処理 (rotation あり)。
 *
 * 1. hash で oauth_tokens を引く (token_type = 'refresh')
 * 2. revoked / expired / client_id を検証
 * 3. 旧 refresh を revoke (revoked_at)
 * 4. 新しい access + refresh を発行 (新 refresh.parent_token_id = 旧 refresh.id)
 */
export async function refreshAccessToken(input: RefreshAccessTokenInput): Promise<TokenResponse> {
  const refreshHash = hashToken(input.refresh_token);
  const db = createOAuthDbClient();

  const { data: row, error: lookupError } = await db
    .from('oauth_tokens')
    .select('*')
    .eq('token_hash', refreshHash)
    .eq('token_type', 'refresh')
    .maybeSingle();

  if (lookupError) {
    throw new OAuthServerError('server_error', lookupError.message, 500);
  }
  if (!row) {
    throw new OAuthServerError('invalid_grant', 'Refresh token not found');
  }
  if (row.revoked_at) {
    throw new OAuthServerError('invalid_grant', 'Refresh token revoked');
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new OAuthServerError('invalid_grant', 'Refresh token expired');
  }
  if (row.client_id !== input.client_id) {
    throw new OAuthServerError('invalid_grant', 'client_id mismatch');
  }

  const { error: revokeError } = await db
    .from('oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', row.id);
  if (revokeError) {
    throw new OAuthServerError('server_error', revokeError.message, 500);
  }

  return issueTokenPair({
    userId: row.user_id,
    clientId: row.client_id,
    scopes: row.scopes,
    parentRefreshTokenId: row.id,
  });
}

interface IssueTokenPairInput {
  userId: string;
  clientId: 'claude-ai' | 'chatgpt' | 'cursor' | 'unknown';
  scopes: ('read:entries' | 'read:tags' | 'read:stats')[];
  /** 旧 refresh の id (rotation chain 追跡用)。authorization_code grant 時は null。 */
  parentRefreshTokenId: string | null;
}

async function issueTokenPair(input: IssueTokenPairInput): Promise<TokenResponse> {
  const db = createOAuthDbClient();
  const access = generateOpaqueToken('access');
  const refresh = generateOpaqueToken('refresh');
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000).toISOString();

  const { data: refreshRow, error: refreshInsertError } = await db
    .from('oauth_tokens')
    .insert({
      user_id: input.userId,
      token_hash: refresh.hash,
      token_type: 'refresh',
      client_id: input.clientId,
      scopes: input.scopes,
      expires_at: refreshExpiresAt,
      parent_token_id: input.parentRefreshTokenId,
    })
    .select('id')
    .single();
  if (refreshInsertError || !refreshRow) {
    throw new OAuthServerError('server_error', 'Failed to issue refresh token', 500);
  }

  const { error: accessInsertError } = await db.from('oauth_tokens').insert({
    user_id: input.userId,
    token_hash: access.hash,
    token_type: 'access',
    client_id: input.clientId,
    scopes: input.scopes,
    expires_at: accessExpiresAt,
    parent_token_id: refreshRow.id,
  });
  if (accessInsertError) {
    throw new OAuthServerError('server_error', 'Failed to issue access token', 500);
  }

  return {
    access_token: access.token,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SEC,
    refresh_token: refresh.token,
    scope: input.scopes.join(' '),
  };
}
