import { NextResponse, type NextRequest } from 'next/server';

import {
  isSecureRequest,
  normalizeLocale,
  setConnectFlowCookie,
} from '@/features/external-calendar/server/connect-flow';
import {
  buildAuthorizationUrl,
  generatePkcePair,
  generateState,
  isGoogleCalendarConfigured,
  resolveRedirectUri,
} from '@/features/external-calendar/server/google-oauth';
import { checkProAccessForUser } from '@/lib/billing/enforcement';
import { logger } from '@/lib/logger';
import { calendarConnectStartRateLimit } from '@/lib/rate-limit/upstash';
import { captureUnexpectedError } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/server';

/** AES-256-GCM に node:crypto が要る。Edge では動かない。 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Google カレンダー接続の開始。
 *
 * `/api/*` は proxy の認証をスキップする（`src/proxy.ts` の early return）ので、
 * このルートが自前で session を取る。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const secure = isSecureRequest(requestUrl);

  // env が未投入の環境（マージ直後の production を含む）では接続を始めない。
  // ここで止めないと client_id が空のまま Google の invalid_client 画面へ飛ぶ。
  if (!isGoogleCalendarConfigured()) {
    logger.warn('[calendar-connect] google calendar integration is not configured');
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

  const proAccess = await checkProAccessForUser(supabase, user.id);

  if (proAccess === 'lookup_failed') {
    captureUnexpectedError(new Error('subscription lookup failed'), {
      feature: 'external_calendar',
      operation: 'check_pro_subscription',
      route: '/api/integrations/google-calendar/start',
    });
    return NextResponse.json({ error: 'Failed to verify subscription' }, { status: 500 });
  }

  if (proAccess === 'denied') {
    return NextResponse.json({ error: 'Pro plan required' }, { status: 403 });
  }

  // Upstash 未設定なら null、Redis 障害なら throw。どちらでも接続開始は止めない
  // （可用性優先。iCal feed route と同じ判断）。
  if (calendarConnectStartRateLimit) {
    try {
      const { success } = await calendarConnectStartRateLimit.limit(`calendar-connect:${user.id}`);
      if (!success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
    } catch (error) {
      captureUnexpectedError(
        error instanceof Error ? error : new Error('calendar connect rate limit failed'),
        {
          feature: 'external_calendar',
          operation: 'check_rate_limit',
          route: '/api/integrations/google-calendar/start',
          source: 'upstash',
        },
      );
      logger.warn('[calendar-connect] rate limit unavailable; continuing');
    }
  }

  // request から URL を組み立て直さず、allowlist の文字列そのものを使う。
  // host は forwarded ヘッダで動かせるため、導出値を Google へ渡すと code を
  // 第三者ホストへ配送させる経路になる。
  const redirectUri = resolveRedirectUri(requestUrl);
  if (!redirectUri) {
    logger.warn('[calendar-connect] no redirect URI registered for this host');
    return NextResponse.json(
      { error: 'Calendar connection is not available in this environment' },
      { status: 400 },
    );
  }

  const state = generateState();
  const { verifier, challenge } = generatePkcePair();
  const locale = normalizeLocale(requestUrl.searchParams.get('locale') ?? undefined);

  const response = NextResponse.redirect(
    buildAuthorizationUrl({ redirectUri, state, codeChallenge: challenge }),
  );

  setConnectFlowCookie(response, { state, verifier, locale, userId: user.id }, secure);

  return response;
}
