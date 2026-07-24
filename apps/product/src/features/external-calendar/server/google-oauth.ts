import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { env } from '@/env';

import {
  GOOGLE_AUTHORIZATION_SCOPES,
  GOOGLE_CALENDAR_READONLY_SCOPE,
  googleIdTokenPayloadSchema,
  googleTokenResponseSchema,
  type GoogleIdTokenPayload,
  type GoogleTokenResponse,
} from '../schemas/google';
import { isValidEncryptionKey } from './token-crypto';

/**
 * Google OAuth client 側の処理。googleapis SDK は入れず素の fetch + zod（overview.md §5-2）。
 *
 * Dayopt 自身は `lib/oauth-server/` で OAuth *provider* も実装しているが、あちらは
 * authorization server 側の関心事で、ここは client 側。共有できるのは PKCE の計算式だけで、
 * `ENTROPY_BYTES` も `hashToken` も module-private なので import できない。
 */

const GOOGLE_AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** `lib/oauth-server/tokens.ts` の ENTROPY_BYTES と同値。独自の桁数を発明しない。 */
const ENTROPY_BYTES = 32;

/** supabase client（`lib/supabase/oauth.ts`）と同じ外部呼び出しタイムアウト。 */
const TOKEN_REQUEST_TIMEOUT_MS = 15_000;

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    /** redirect の `?reason=` に載る安定コード。 */
    readonly reason: string,
    /** provider が返した `error` 値と HTTP status。monitoring 用に握り潰さない。 */
    readonly providerError?: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

/**
 * ユーザー入力（code）が原因で必ず起きうる provider エラー。
 *
 * これだけを「想定内の失敗」として扱う。`invalid_client` や `redirect_uri_mismatch`、
 * Google の 5xx は我々の設定不備や障害であり、全接続が失敗しているのに無通知という
 * 状態を作らないため、必ず alert 側へ回す。
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-5.2
 */
const USER_RECOVERABLE_PROVIDER_ERRORS = new Set(['invalid_grant']);

/**
 * connect フローに必要な env が揃っているか。route の config guard が使う。
 *
 * 暗号鍵は「空でない」ではなく実際に 32 バイトへ decode できるかまで見る。長さが違う鍵だと
 * `/start` でユーザーを Google へ送り、code 交換まで済ませてから `encryptToken` が落ちる。
 * 同意まで取っておいて保存できない、が一番たちが悪い。
 */
export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
    env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() &&
    env.GOOGLE_CALENDAR_REDIRECT_URIS?.trim() &&
    isValidEncryptionKey(env.CALENDAR_TOKEN_ENCRYPTION_KEY),
  );
}

/**
 * request の host に完全一致する redirect URI を allowlist から引く。
 *
 * request から URL を組み立て直さず allowlist の文字列をそのまま返すのが要点。
 * host は攻撃者が forwarded ヘッダで動かせるので、導出値を Google へ渡すと code を
 * 第三者ホストへ配送させる経路になる。lookup に失敗したら接続を始めない。
 */
export function resolveRedirectUri(requestUrl: URL): string | null {
  const configured = env.GOOGLE_CALENDAR_REDIRECT_URIS?.trim();
  if (!configured) return null;

  for (const candidate of configured.split(',')) {
    const uri = candidate.trim();
    if (!uri) continue;

    try {
      if (new URL(uri).host === requestUrl.host) return uri;
    } catch {
      // env の refine が弾いているはずだが、壊れた値で全体を落とさない。
      continue;
    }
  }

  return null;
}

type PkcePair = {
  verifier: string;
  challenge: string;
};

/** RFC 7636 の S256。`tokens.ts:48` の verify 側と同じ計算式。 */
export function generatePkcePair(): PkcePair {
  const verifier = randomBytes(ENTROPY_BYTES).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  return { verifier, challenge };
}

/** CSRF 用の不透明な state。 */
export function generateState(): string {
  return randomBytes(ENTROPY_BYTES).toString('base64url');
}

/** 同意画面の URL。`prompt=consent` で refresh token を確実に取りに行く。 */
export function buildAuthorizationUrl(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(GOOGLE_AUTHORIZE_ENDPOINT);

  url.searchParams.set('client_id', env.GOOGLE_CALENDAR_CLIENT_ID ?? '');
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_AUTHORIZATION_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  // `include_granted_scopes` は付けない。付けると、この client が過去にそのユーザーへ
  // 得ていた scope まで今回の認可へ畳み込まれ、保存する refresh token が本機能に必要な
  // 範囲を超えた権限を持ちうる。callback は calendar.readonly の有無しか見ないので、
  // 余分な scope はそのまま通ってしまう。必要な scope は最初から
  // GOOGLE_AUTHORIZATION_SCOPES で全部要求しており、incremental auth は使っていない。
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

/**
 * authorization code を token に交換する。
 *
 * 失敗レスポンスからは `error` / `error_description` しか読まない。body 全体を握ると
 * `code` がログや Sentry に流れる事故が起きる。
 */
export async function exchangeAuthorizationCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
    client_id: env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
    client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
  });

  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GoogleOAuthError('token endpoint is unreachable', 'token_endpoint_unreachable');
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // `error` は RFC 6749 の短い列挙値なので握っても安全。`error_description` は
    // リクエスト内容を echo することがあるので読まない。
    const errorCode =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : 'unknown_error';

    // ユーザーが古い / 使用済み code を投げれば必ず起きる invalid_grant だけを想定内とし、
    // 設定不備（invalid_client / redirect_uri_mismatch）や Google 障害とは別 reason にする。
    const reason = USER_RECOVERABLE_PROVIDER_ERRORS.has(errorCode)
      ? 'authorization_expired'
      : 'token_exchange_rejected';

    throw new GoogleOAuthError(
      `token exchange rejected: ${errorCode}`,
      reason,
      errorCode,
      response.status,
    );
  }

  const parsed = googleTokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new GoogleOAuthError('token response has an unexpected shape', 'token_response_invalid');
  }

  return parsed.data;
}

/**
 * id_token の payload を読む。
 *
 * 署名検証はしない。TLS 直結の token endpoint から受け取ったものなので OpenID Connect
 * Core §3.1.3.7 が署名検証の省略を認めている。JWKS を取りに行くと鍵キャッシュという
 * 運用面が増えるだけで、この経路では防御価値が上がらない。`iss` / `aud` / `exp` は検証する。
 */
export function parseIdToken(idToken: string): GoogleIdTokenPayload {
  const segments = idToken.split('.');
  const encodedPayload = segments[1];
  if (segments.length !== 3 || encodedPayload === undefined) {
    throw new GoogleOAuthError('id_token is not a JWT', 'id_token_malformed');
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new GoogleOAuthError('id_token payload is not JSON', 'id_token_malformed');
  }

  const parsed = googleIdTokenPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new GoogleOAuthError('id_token payload has an unexpected shape', 'id_token_invalid');
  }

  if (parsed.data.aud !== env.GOOGLE_CALENDAR_CLIENT_ID) {
    throw new GoogleOAuthError('id_token audience mismatch', 'id_token_audience_mismatch');
  }

  if (parsed.data.exp * 1000 <= Date.now()) {
    throw new GoogleOAuthError('id_token is expired', 'id_token_expired');
  }

  return parsed.data;
}

/**
 * 付与された scope を配列にする。
 *
 * `filter(Boolean)` は必須。連続スペースで空文字が混じると、`granted_scopes` の
 * not-empty CHECK は通ってしまう一方で scope 判定だけが壊れる。
 */
export function parseGrantedScopes(scope: string): string[] {
  return scope.split(' ').filter(Boolean);
}

/** granular consent で calendar だけ外されていないか。 */
export function hasCalendarReadonlyScope(grantedScopes: string[]): boolean {
  return grantedScopes.includes(GOOGLE_CALENDAR_READONLY_SCOPE);
}
