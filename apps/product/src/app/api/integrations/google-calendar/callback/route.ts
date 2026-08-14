import { timingSafeEqual } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/env';
import {
  clearConnectFlowCookie,
  connectFlowCookieName,
  isSecureRequest,
  normalizeLocale,
  parseConnectFlowCookie,
} from '@/features/external-calendar/server/connect-flow';
import {
  CALENDAR_CONNECTION_DB_TIMEOUT_MS,
  getReconnectTarget,
  reconnectExistingConnection,
  saveConnection,
} from '@/features/external-calendar/server/connection-service';
import {
  exchangeAuthorizationCode,
  GoogleOAuthError,
  hasRequiredCalendarScopes,
  isGoogleCalendarConfigured,
  parseGrantedScopes,
  parseIdToken,
  resolveRedirectUri,
  TOKEN_REQUEST_TIMEOUT_MS,
} from '@/features/external-calendar/server/google-oauth';
import { checkProAccessForUser } from '@/lib/billing/enforcement';
import { logger } from '@/lib/logger';
import { isWriteFenceEnabled } from '@/lib/ops/write-fence';
import { calendarConnectRateLimit } from '@/lib/rate-limit/upstash';
import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { captureUnexpectedError } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/server';
import { resolveMfaAssurance } from '@/lib/trpc/session-auth-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * #1990 の予算検査により「code 消費後に kill される」経路は塞いだが、その予算検査
 * 自体の設計（`POST_EXCHANGE_BUDGET_MS = 45_000` 固定）と `maxDuration` の関係を
 * 指揮台が再検討した（PR #2075 クロスレビュー、risk/behavior 両者一致）。
 *
 * maxDuration=60 のままだと `TIME_BUDGET_MS(50s) - POST_EXCHANGE_BUDGET_MS(45s) = 5s` が
 * code 消費前フェーズ（getUser / MFA / rate limit / write fence / Pro 判定の直列
 * 4〜5 ホップ）の全予算になる。個別 timeout に達しない軽度の遅延（Supabase 1 往復 2s 級）
 * だけで、従来成功していた接続が `budget_exhausted` になる可用性の崖ができる。
 *
 * **指揮台決定**: maxDuration を 90 へ引き上げる（`POST_EXCHANGE_BUDGET_MS` = 45s は
 * 不変）。消費前スラックが 35s に回復し、worst case 総計 80s ≤ 90 で hard kill margin
 * 10s を維持する。安全性（code 消費前後の境界の扱い）は変えず、可用性の崖だけを除去する。
 */
export const maxDuration = 90;

/** maxDuration に対する安全マージン。cron（`TIME_BUDGET_MS`）と同じ導出。 */
const TIME_BUDGET_MS = 80_000;

/**
 * code 消費の危険窓（#1990）。
 *
 * 「危険」は token 交換（`exchangeAuthorizationCode`）の呼び出しを**始めた**時点から始まる —
 * Google が request を受理した後に応答待ちの途中で kill されると、こちらからは成否が
 * 分からないまま code だけ消費済みになりうるため、交換呼び出し自体の worst case
 * （`TOKEN_REQUEST_TIMEOUT_MS`）も危険窓に含める（交換が成功で返ってきてから初めて
 * 危険が始まる、という早合点をしない）。
 *
 * 交換後の DB 書き込みは reconnect 経路（`getReconnectTarget` + `reconnectExistingConnection`
 * の 2 回の DB 往復が直列）を基準にする。新規接続経路（`saveConnection` 1 回）はこれより
 * 短く、常に安全側。`TOKEN_REQUEST_TIMEOUT_MS` / `CALENDAR_CONNECTION_DB_TIMEOUT_MS` から
 * 導出し、手書きの数値を二重管理しない。
 */
const POST_EXCHANGE_BUDGET_MS = TOKEN_REQUEST_TIMEOUT_MS + 2 * CALENDAR_CONNECTION_DB_TIMEOUT_MS;

/**
 * Settings への戻り先。
 *
 * locale-aware な Integrations 設定へ返す。PC / mobile の query 処理は設定ページの
 * Composition Layer が一元管理する。
 */
function settingsRedirect(requestUrl: URL, locale: string, result: string, reason?: string): URL {
  const query = new URLSearchParams({ calendar: result });
  if (reason) query.set('reason', reason);

  const path = getSafeRedirectPath(`/${locale}/settings/integrations?${query.toString()}`, '/week');
  return new URL(path, requestUrl);
}

/** 一定長でない値を timingSafeEqual に渡すと RangeError になるので長さを先に見る。 */
function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const deadlineAt = Date.now() + TIME_BUDGET_MS;
  const secure = isSecureRequest(requestUrl);
  const cookieValue = request.cookies.get(connectFlowCookieName(secure))?.value;
  const flowState = parseConnectFlowCookie(cookieValue);
  const locale = normalizeLocale(flowState?.locale);

  const fail = (reason: string): NextResponse => {
    const response = NextResponse.redirect(settingsRedirect(requestUrl, locale, 'error', reason));
    clearConnectFlowCookie(response, secure);
    return response;
  };

  if (!isGoogleCalendarConfigured()) {
    logger.warn('[calendar-callback] google calendar integration is not configured');
    return NextResponse.json({ error: 'Integration is not configured' }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL('/auth/login', requestUrl));
  }

  // cookie は自作できるため start を踏まずに callback を直接叩ける。MFA登録済みでaal2未検証の
  // セッションでは、token交換・DB書き込みより前に止める。
  //
  // lookupFailed はセッション自体のAAL claim(自分のcookie由来)から到達しうるため、
  // captureすると攻撃者が任意回数Sentry quotaを焼ける増幅経路になる（invalid_grantを
  // 下のcatchでcaptureしないのと同じ理由）。captureせずlogger.warnに留める。
  const mfaAssurance = await resolveMfaAssurance(supabase, 'calendar_connect');
  if (mfaAssurance.lookupFailed) {
    logger.warn('[calendar-callback] MFA assurance lookup failed');
    return fail('assurance_lookup_failed');
  }
  if (mfaAssurance.currentLevel === 'aal1' && mfaAssurance.nextLevel === 'aal2') {
    logger.warn('[calendar-callback] MFA verification required');
    return fail('mfa_verification_required');
  }

  // start と同じ理由でここにも要る。cookie が自作できる以上、start を踏まずに callback を
  // 叩き続けられるので、無制限だと Google の token endpoint への往復と Sentry capture が
  // 青天井になる。start と同じ key を消費するので、正常な接続 1 回で 2 消費する。
  if (calendarConnectRateLimit) {
    try {
      const { success } = await calendarConnectRateLimit.limit(`calendar-connect:${user.id}`);
      if (!success) {
        logger.warn('[calendar-callback] rate limit exceeded');
        return fail('rate_limited');
      }
    } catch (error) {
      captureUnexpectedError(
        error instanceof Error ? error : new Error('calendar callback rate limit failed'),
        {
          feature: 'external_calendar',
          operation: 'check_rate_limit',
          route: '/api/integrations/google-calendar/callback',
          source: 'upstash',
        },
      );
      logger.warn('[calendar-callback] rate limit unavailable; continuing');
    }
  }

  // rate limit の後に置く。ここでは既に認証済みの user-scope client（supabase）を
  // 使うが、認証・rate limit より前に置くと未認証/連打リクエストが DB 読取を無制限に
  // 駆動できてしまう（増幅経路）ため、その手前には置かない。Google の authorization
  // code は token 交換（exchangeAuthorizationCode）の時点で消費されるので、ここに
  // 置けば code を使う前という要件も満たす。
  if (await isWriteFenceEnabled(supabase)) {
    logger.warn('[calendar-callback] write fence is enabled; rejecting connection');
    return fail('write_fenced');
  }

  // start と同じ Pro ゲートをここでも通す。cookie は署名しておらず HttpOnly は JS を
  // 止めるだけなので、ユーザー自身は devtools や curl で中身を作れる。state / verifier /
  // userId を全部自分で用意して Google の認可 URL を手で組み立てれば、start を一度も
  // 踏まずにこの経路へ到達できる。start 側の 403 だけでは Free ユーザーを止められない。
  const proAccess = await checkProAccessForUser(supabase, user.id);

  if (proAccess === 'lookup_failed') {
    captureUnexpectedError(new Error('subscription lookup failed'), {
      feature: 'external_calendar',
      operation: 'check_pro_subscription',
      route: '/api/integrations/google-calendar/callback',
    });
    return fail('subscription_check_failed');
  }

  if (proAccess === 'denied') {
    logger.warn('[calendar-callback] pro entitlement is required');
    return fail('pro_required');
  }

  if (!flowState) {
    logger.warn('[calendar-callback] connect flow cookie is missing or malformed');
    return fail('missing_state');
  }

  // start と callback の間にログアウト → 別アカウントでログインされると、他人の Google
  // アカウントが別人の行に紐づく。userId は秘密ではないので単純比較で足りる
  // （timingSafeEqual は攻撃者が長さを操作できるため RangeError の的になる）。
  if (flowState.userId !== user.id) {
    logger.warn('[calendar-callback] session user does not match the user that started the flow');
    return fail('session_mismatch');
  }

  const errorParam = requestUrl.searchParams.get('error');
  if (errorParam) {
    // ユーザーが同意画面で拒否した場合を含む。値はそのままログに出さない。
    logger.info('[calendar-callback] authorization was not granted');
    return fail('access_denied');
  }

  const stateParam = requestUrl.searchParams.get('state');
  if (!stateParam || !safeEquals(stateParam, flowState.state)) {
    logger.warn('[calendar-callback] state mismatch');
    return fail('state_mismatch');
  }

  const code = requestUrl.searchParams.get('code');
  if (!code) {
    return fail('missing_code');
  }

  const redirectUri = resolveRedirectUri(requestUrl);
  if (!redirectUri) {
    logger.warn('[calendar-callback] no redirect URI registered for this host');
    return fail('unsupported_environment');
  }

  try {
    // code を消費する（= token 交換を呼ぶ）前に、消費後の DB 書き込みを完走できる見込みが
    // あるかを検査する（#1990）。ここで諦めれば code は未消費のまま残るので、ユーザーは
    // Google の認可からやり直さずに再試行できる — 消費後に kill されるより安全側。
    if (deadlineAt - Date.now() < POST_EXCHANGE_BUDGET_MS) {
      logger.warn('[calendar-callback] insufficient time budget remaining before code exchange');
      return fail('budget_exhausted');
    }

    const tokens = await exchangeAuthorizationCode({
      code,
      redirectUri,
      codeVerifier: flowState.verifier,
    });

    const grantedScopes = parseGrantedScopes(tokens.scope);
    if (!hasRequiredCalendarScopes(grantedScopes)) {
      // granular consent でカレンダー scope の一部だけ外された場合。active な接続を作ると
      // 同期が毎回 403 になり「接続済みなのに同期されない」状態が残る。
      logger.warn('[calendar-callback] required calendar scopes were not granted');
      return fail('scope_not_granted');
    }

    if (!tokens.refresh_token) {
      // 既存行があっても触らない。失効済み token を保ったまま status を active に戻すと
      // 再認証導線が出なくなる。
      logger.warn('[calendar-callback] token response did not include a refresh token');
      return fail('missing_refresh_token');
    }

    const idToken = parseIdToken(tokens.id_token);

    const connectionInput = {
      userId: user.id,
      providerAccountId: idToken.sub,
      providerAccountEmail: idToken.email ?? null,
      grantedScopes,
      refreshToken: tokens.refresh_token,
      encryptionKey: env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? '',
    };

    if (flowState.reconnectConnectionId) {
      const target = await getReconnectTarget(user.id, flowState.reconnectConnectionId);
      if (!target) return fail('reconnect_target_invalid');
      if (target.providerAccountId !== idToken.sub) return fail('account_mismatch');

      const outcome = await reconnectExistingConnection({
        ...connectionInput,
        connectionId: flowState.reconnectConnectionId,
      });
      if (outcome === 'missing') return fail('reconnect_target_invalid');
    } else {
      await saveConnection(connectionInput);
    }
  } catch (error) {
    if (error instanceof GoogleOAuthError) {
      logger.warn('[calendar-callback] google oauth exchange failed');

      // 古い / 使用済み code は誰でも投げられるので Sentry には送らない（capture 自体が
      // quota を焼く増幅経路になる）。それ以外は必ず送る — invalid_client や
      // redirect_uri_mismatch、Google の 5xx を巻き込んで抑制すると、全接続が失敗
      // しているのに無通知という状態になる。
      if (error.reason !== 'authorization_expired') {
        // TechnicalErrorContext のキーは allowlist なので、provider の error 種別は
        // errorCode に畳む。HTTP status は message 側（`token exchange rejected: ...`）に残る。
        captureUnexpectedError(error, {
          feature: 'external_calendar',
          operation: 'exchange_authorization_code',
          route: '/api/integrations/google-calendar/callback',
          errorCode: error.providerError ?? error.reason,
          source: 'google_token_endpoint',
        });
      }

      return fail(error.reason);
    }

    captureUnexpectedError(
      error instanceof Error ? error : new Error('calendar connection failed'),
      {
        feature: 'external_calendar',
        operation: 'save_connection',
        route: '/api/integrations/google-calendar/callback',
      },
    );
    logger.error('[calendar-callback] failed to save the calendar connection');
    return fail('connection_failed');
  }

  const response = NextResponse.redirect(settingsRedirect(requestUrl, locale, 'connected'));
  clearConnectFlowCookie(response, secure);
  return response;
}
