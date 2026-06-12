import 'server-only';

import { databaseTables } from '@dayopt/database';
import type { OAuthClientId } from './clients';
import { createOAuthDbClient } from './db';
import { OAuthServerError } from './errors';
import type { SupportedScope } from './scopes';
import { generateOpaqueToken, hashToken, verifyPkceS256 } from './tokens';

/** Phase 1 token TTLs (Decision 1). */
const ACCESS_TOKEN_TTL_SEC = 300; // 5 min
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 day

interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface ExchangeAuthorizationCodeInput {
  code: string;
  /** 呼び出し元 (token route) で resolveClient による allowlist 照合済みである前提。 */
  client_id: OAuthClientId;
  redirect_uri: string;
  code_verifier: string;
}

/**
 * authorization_code grant の交換処理。
 *
 * **原子的 consume-or-fail**:
 * 1. UPDATE consumed_at = now WHERE code_hash AND consumed_at IS NULL AND expires_at > now
 *    AND client_id AND redirect_uri (CAS で同時実行を 1 件だけ通す)
 * 2. 0 件なら invalid (consumed / expired / mismatch)
 * 3. PKCE 検証 (DB ではできないので post-CAS)
 * 4. access + refresh を発行
 */
export async function exchangeAuthorizationCode(
  input: ExchangeAuthorizationCodeInput,
): Promise<TokenResponse> {
  const codeHash = hashToken(input.code);
  const now = new Date().toISOString();
  const db = createOAuthDbClient();

  const { data: rows, error: consumeError } = await db
    .from(databaseTables.oauthAuthorizationCodes)
    .update({ consumed_at: now })
    .eq('code_hash', codeHash)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .eq('client_id', input.client_id)
    .eq('redirect_uri', input.redirect_uri)
    .select('user_id, client_id, code_challenge, scopes');

  if (consumeError) {
    throw new OAuthServerError('server_error', consumeError.message, 500);
  }
  if (!rows || rows.length !== 1) {
    throw new OAuthServerError('invalid_grant', 'Invalid or expired authorization code');
  }
  const row = rows[0]!;

  // PKCE は SQL でハッシュできないので CAS の後に検証する。失敗時 code は既に consumed
  // にマークされているので replay は不可能。
  if (!verifyPkceS256(input.code_verifier, row.code_challenge)) {
    throw new OAuthServerError('invalid_grant', 'PKCE verification failed');
  }

  return issueTokenPair({
    userId: row.user_id,
    // DB の client_id / scopes は CHECK 制約 + insert 側で narrow に保たれているため cast。
    clientId: row.client_id as OAuthClientId,
    scopes: row.scopes as SupportedScope[],
    parentRefreshTokenId: null,
  });
}

interface RefreshAccessTokenInput {
  refresh_token: string;
  /** 呼び出し元 (token route) で resolveClient による allowlist 照合済みである前提。 */
  client_id: OAuthClientId;
}

/**
 * refresh_token grant 処理 (rotation あり)。
 *
 * **原子的 revoke-or-fail**:
 * 1. UPDATE revoked_at = now WHERE token_hash AND token_type='refresh' AND revoked_at IS NULL
 *    AND expires_at > now AND client_id (CAS)
 * 2. 0 件なら invalid (revoked / expired / mismatch)
 * 3. 新 access + refresh を発行 (parent_token_id = 旧 refresh.id)
 */
export async function refreshAccessToken(input: RefreshAccessTokenInput): Promise<TokenResponse> {
  const refreshHash = hashToken(input.refresh_token);
  const now = new Date().toISOString();
  const db = createOAuthDbClient();

  const { data: rows, error: revokeError } = await db
    .from(databaseTables.oauthTokens)
    .update({ revoked_at: now })
    .eq('token_hash', refreshHash)
    .eq('token_type', 'refresh')
    .is('revoked_at', null)
    .gt('expires_at', now)
    .eq('client_id', input.client_id)
    .select('id, user_id, client_id, scopes');

  if (revokeError) {
    throw new OAuthServerError('server_error', revokeError.message, 500);
  }
  if (!rows || rows.length !== 1) {
    throw new OAuthServerError('invalid_grant', 'Invalid or expired refresh token');
  }
  const row = rows[0]!;

  return issueTokenPair({
    userId: row.user_id,
    clientId: row.client_id as OAuthClientId,
    scopes: row.scopes as SupportedScope[],
    parentRefreshTokenId: row.id,
  });
}

interface IssueTokenPairInput {
  userId: string;
  clientId: OAuthClientId;
  scopes: SupportedScope[];
  /** 旧 refresh の id (rotation chain 追跡用)。authorization_code grant 時は null。 */
  parentRefreshTokenId: string | null;
}

/**
 * NOTE (Phase 1.5): refresh + access の 2 つの insert が atomic ではないため、
 * 第二の insert が失敗すると orphan refresh が DB に残る。client は token を
 * 受け取らないので security 的な漏洩はないが衛生面で気持ち悪い。Phase 1.5 で
 * `issue_oauth_token_pair(...)` という Postgres RPC (1 transaction) に置換する。
 */
async function issueTokenPair(input: IssueTokenPairInput): Promise<TokenResponse> {
  const db = createOAuthDbClient();
  const access = generateOpaqueToken('access');
  const refresh = generateOpaqueToken('refresh');
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000).toISOString();

  const { data: refreshRow, error: refreshInsertError } = await db
    .from(databaseTables.oauthTokens)
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

  const { error: accessInsertError } = await db.from(databaseTables.oauthTokens).insert({
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
