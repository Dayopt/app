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
import { saveConnection } from '@/features/external-calendar/server/connection-service';
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
import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { captureUnexpectedError } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Settings への戻り先。
 *
 * `integrations` カテゴリは Step 6 まで存在せず、未知カテゴリは空ページになるため
 * 当面は `account` へ返す。PC では settings ページが query を落とすので、この query を
 * Step 6 の UI トリガに使わないこと。
 */
function settingsRedirect(requestUrl: URL, locale: string, result: string, reason?: string): URL {
  const query = new URLSearchParams({ calendar: result });
  if (reason) query.set('reason', reason);

  const path = getSafeRedirectPath(`/${locale}/settings/account?${query.toString()}`, '/week');
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

    await saveConnection({
      userId: user.id,
      providerAccountId: idToken.sub,
      providerAccountEmail: idToken.email ?? null,
      grantedScopes,
      refreshToken: tokens.refresh_token,
      encryptionKey: env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? '',
    });
  } catch (error) {
    if (error instanceof GoogleOAuthError) {
      logger.warn('[calendar-callback] google oauth exchange failed');
      captureUnexpectedError(error, {
        feature: 'external_calendar',
        operation: 'exchange_authorization_code',
        route: '/api/integrations/google-calendar/callback',
        errorCode: error.reason,
      });
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
