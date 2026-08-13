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
  getReconnectTarget,
  reconnectExistingConnection,
  saveConnection,
} from '@/features/external-calendar/server/connection-service';
import {
  exchangeAuthorizationCode,
  GoogleOAuthError,
  hasCalendarReadonlyScope,
  isGoogleCalendarConfigured,
  parseGrantedScopes,
  parseIdToken,
  resolveRedirectUri,
} from '@/features/external-calendar/server/google-oauth';
import { checkProAccessForUser } from '@/lib/billing/enforcement';
import { logger } from '@/lib/logger';
import { isWriteFenceEnabled } from '@/lib/ops/write-fence';
import { calendarConnectRateLimit } from '@/lib/rate-limit/upstash';
import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { captureUnexpectedError } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * 逐次 worst path は再接続分岐が最長で、getUser 15 + rate limit 2 + Pro 判定 15 +
 * Google token 交換 15 + `getReconnectTarget` 15 + `reconnectExistingConnection` 15
 * = 77 秒。段の 60 では足りないので、応答を返す余裕を含めて 120 にする。
 *
 * ここだけ段から外す理由は失敗の質。**Google の authorization code は token 交換の
 * 時点で消費される**ので、その後の DB 書き込み中に kill されると接続は保存されない
 * まま code だけ使用済みになり、再試行は `invalid_grant`。ユーザーは認可からやり直し
 * になる。単なる 504 より重い。
 *
 * より良い解は「code を消費する前に残り予算を検査して、足りなければ手前で諦める」
 * 設計への転換で、これは #1990 で別途扱う。それが入れば 60 へ戻せる。
 */
export const maxDuration = 120;

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
  const secure = isSecureRequest(requestUrl);
  const cookieValue = request.cookies.get(connectFlowCookieName(secure))?.value;
  const flowState = parseConnectFlowCookie(cookieValue);
  const locale = normalizeLocale(flowState?.locale);

  const fail = (reason: string): NextResponse => {
    const response = NextResponse.redirect(settingsRedirect(requestUrl, locale, 'error', reason));
    clearConnectFlowCookie(response, secure);
    return response;
  };

  // Google の authorization code は token 交換の時点で消費される（この handler の
  // maxDuration コメント参照）ので、fence は code を使う前・できるだけ早い段階で
  // 確認する。ここではまだ user session が要らないので service role で読む。
  if (await isWriteFenceEnabled(createServiceRoleClient())) {
    logger.warn('[calendar-callback] write fence is enabled; rejecting connection');
    return fail('write_fenced');
  }

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
    const tokens = await exchangeAuthorizationCode({
      code,
      redirectUri,
      codeVerifier: flowState.verifier,
    });

    const grantedScopes = parseGrantedScopes(tokens.scope);
    if (!hasCalendarReadonlyScope(grantedScopes)) {
      // granular consent でカレンダーだけ外された場合。active な接続を作ると
      // 同期が毎回 403 になり「接続済みなのに同期されない」状態が残る。
      logger.warn('[calendar-callback] calendar.readonly scope was not granted');
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
