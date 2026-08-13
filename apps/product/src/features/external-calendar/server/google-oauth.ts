import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { env } from '@/env';

import {
  GOOGLE_AUTHORIZATION_SCOPES,
  GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE,
  GOOGLE_CALENDAR_LIST_READONLY_SCOPE,
  GOOGLE_CALENDAR_READONLY_SCOPE,
  googleIdTokenPayloadSchema,
  googleTokenResponseSchema,
  type GoogleIdTokenPayload,
  type GoogleTokenResponse,
} from '../schemas/google';
import {
  googleRefreshTokenResponseSchema,
  type GoogleRefreshTokenResponse,
} from '../schemas/google-calendar';
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
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

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

/**
 * 同意画面の URL。refresh token を取り直し、接続する Google アカウントを毎回選ばせる。
 *
 * 再接続では `loginHint` に対象アカウントのアドレスを渡す。複数の Google アカウントに
 * ログインしている人は、どれを選び直すべきかを画面から知る術が無く、違うアカウントを
 * 選ぶと callback の `sub` 一致検査で `account_mismatch` になってやり直しになる。
 * hint は表示上の示唆でしかなく、実際に何を選んだかは常に `sub` で検証する。
 */
export function buildAuthorizationUrl(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  loginHint?: string;
}): string {
  const url = new URL(GOOGLE_AUTHORIZE_ENDPOINT);

  url.searchParams.set('client_id', env.GOOGLE_CALENDAR_CLIENT_ID ?? '');
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_AUTHORIZATION_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent select_account');
  // `include_granted_scopes` は付けない。付けると、この client が過去にそのユーザーへ
  // 得ていた scope まで今回の認可へ畳み込まれ、保存する refresh token が本機能に必要な
  // 範囲を超えた権限を持ちうる。callback は hasRequiredCalendarScopes の判定しか見ないので、
  // 余分な scope はそのまま通ってしまう。必要な scope は最初から
  // GOOGLE_AUTHORIZATION_SCOPES で全部要求しており、incremental auth は使っていない。
  if (params.loginHint) url.searchParams.set('login_hint', params.loginHint);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

/**
 * token endpoint へ form POST し、成功 body を返す。
 *
 * 失敗レスポンスからは `error` しか読まない。body 全体を握ると `code` や refresh token が
 * ログや Sentry に流れる事故が起きる（`error_description` はリクエスト内容を echo する）。
 *
 * `invalid_grant` のときの reason を呼び出し側が決めるのは、意味が経路で違うため。
 * code 交換の invalid_grant は「古い / 使用済み code」でユーザーがやり直せばよいが、
 * refresh の invalid_grant は「保存済み接続が恒久的に死んだ」で再接続が要る（§5-4）。
 */
async function postToTokenEndpoint(params: {
  body: URLSearchParams;
  /** `invalid_grant` のときに使う reason。 */
  recoverableReason: string;
  /** それ以外の provider 拒否で使う reason。 */
  rejectedReason: string;
  /** エラー message の prefix。 */
  operation: string;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.body,
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GoogleOAuthError('token endpoint is unreachable', 'token_endpoint_unreachable');
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    // `error` は RFC 6749 の短い列挙値なので握っても安全。
    const errorCode =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : 'unknown_error';

    // 設定不備（invalid_client / redirect_uri_mismatch）や Google 障害は別 reason にして
    // 必ず alert 側へ回す。
    const reason = USER_RECOVERABLE_PROVIDER_ERRORS.has(errorCode)
      ? params.recoverableReason
      : params.rejectedReason;

    throw new GoogleOAuthError(
      `${params.operation} rejected: ${errorCode}`,
      reason,
      errorCode,
      response.status,
    );
  }

  return payload;
}

/**
 * authorization code を token に交換する。
 */
export async function exchangeAuthorizationCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> {
  const payload = await postToTokenEndpoint({
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
    }),
    recoverableReason: 'authorization_expired',
    rejectedReason: 'token_exchange_rejected',
    operation: 'token exchange',
  });

  const parsed = googleTokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new GoogleOAuthError('token response has an unexpected shape', 'token_response_invalid');
  }

  return parsed.data;
}

/**
 * refresh token から access token を mint する。
 *
 * access token は保存しない（§5-3）。同期の実行ごとにここで作って使い切る。`expires_in` は
 * 値が保証されていない（公式サンプルでも 3920 / 3599 と揺れる）ので、有効期限を DB に
 * 書く実装は持たない。
 *
 * `refresh_token` は通常返らないが、返った場合は呼び出し側が保存し直す必要がある。
 * 黙って捨てると、Google が rotation を始めた時に接続が静かに死ぬ。
 */
export async function refreshAccessToken(params: {
  refreshToken: string;
}): Promise<GoogleRefreshTokenResponse> {
  const payload = await postToTokenEndpoint({
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
    }),
    // 接続が恒久的に死んだ状態。呼び出し側はこれを見て status='reauth_required' に落とす。
    recoverableReason: 'refresh_token_revoked',
    rejectedReason: 'token_refresh_rejected',
    operation: 'token refresh',
  });

  const parsed = googleRefreshTokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    // 初回の code 交換用 schema は id_token を必須にしているので、ここで流用してはいけない。
    // refresh のレスポンスに id_token は入らない。
    throw new GoogleOAuthError(
      'refresh response has an unexpected shape',
      'token_response_invalid',
    );
  }

  return parsed.data;
}

/**
 * refresh token を revoke する。best-effort（§8-1）。
 *
 * token は form body に載せる。query string に置くとアクセスログ・プロキシログ・Sentry の
 * breadcrumb に残る。
 *
 * 既に失効している（`400 invalid_token`）場合も成功として扱い、切断を冪等にする。
 *
 * 注意: revoke は GCP project 単位で効く。同じ project の別 client がそのユーザーへ持つ
 * grant も巻き添えで無効になる。現状 client は 1 つなので実害は無いが、将来 Gmail 連携などを
 * 同じ project に足す時はここが効いてくる。
 *
 * @returns 失効が確定したら true。ネットワーク断や Google の 5xx では false（呼び出し側は続行する）
 */
export async function revokeRefreshToken(token: string): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return false;
  }

  if (response.ok) return true;

  // 200 は body 空なので、ここに来るのは 4xx/5xx のみ。
  const payload: unknown = await response.json().catch(() => null);
  const errorCode =
    payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : 'unknown_error';

  return response.status === 400 && errorCode === 'invalid_token';
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

/**
 * 同期に必要な Calendar scope が揃っているか。
 *
 * narrow pair（`calendarList.list` + `events.list`）は AND 判定にする。Google の
 * granular consent で片方だけ許可されうるため、いずれか 1 つで通す OR 判定にすると、
 * 接続は active として保存されたのに一方が恒久的に 403 になり「Connected なのに
 * 一覧が出ない / 同期されない」状態が残る。
 *
 * 旧・広い `calendar.readonly` は OR で残す。新規の認可リクエストではもう要求しない
 * （`GOOGLE_AUTHORIZATION_SCOPES`）が、既に grant 済みの既存接続はこの scope のまま
 * 動き続けるため、ここで弾くと既存ユーザー全員が再認証を要求される。削除できるのは
 * 既存接続の narrow pair 移行が完了した後（#1982 plan v4 §5-3 の完了条件、follow-up
 * issue で扱う）。
 */
export function hasRequiredCalendarScopes(grantedScopes: string[]): boolean {
  const granted = new Set(grantedScopes);
  const hasNarrowPair =
    granted.has(GOOGLE_CALENDAR_LIST_READONLY_SCOPE) &&
    granted.has(GOOGLE_CALENDAR_EVENTS_READONLY_SCOPE);

  return hasNarrowPair || granted.has(GOOGLE_CALENDAR_READONLY_SCOPE);
}
