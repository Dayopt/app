import 'server-only';

import { routing } from '@dayopt/i18n/routing';
import type { NextResponse } from 'next/server';

import { connectFlowStateSchema, type ConnectFlowState } from '../schemas/google';

/**
 * connect フローの一時 state を運ぶ cookie。
 *
 * 署名しない。`__Host-` prefix が Domain 属性を禁じ Secure を必須にするため、サブドメインからの
 * cookie 注入（署名が防ぎたかった攻撃）はブラウザ側で塞がる。`state` と `verifier` は不透明な
 * ランダムで、改竄すれば state 照合か PKCE 検証で落ちるだけ。`userId` は秘密ではなく、
 * 書き換えても callback 側の session と一致しなくなって flow が止まるだけ。設計は overview.md §4-3 の
 * 「鍵の用途を分離する」方針に従い、`CALENDAR_TOKEN_ENCRYPTION_KEY` を HMAC に兼用しない。
 */

const COOKIE_BASE_NAME = 'dayopt-calendar-connect';

/** 同意画面の往復に必要十分。長く持つほど盗まれた cookie の窓が広がる。 */
const CONNECT_FLOW_COOKIE_MAX_AGE_SECONDS = 600;

/**
 * `__Host-` は Secure を要求するので、http の localhost では付けられない。
 * Vercel 上（= VERCEL_ENV あり）では常に付ける。
 */
export function connectFlowCookieName(isSecureContext: boolean): string {
  return isSecureContext ? `__Host-${COOKIE_BASE_NAME}` : COOKIE_BASE_NAME;
}

export function isSecureRequest(requestUrl: URL): boolean {
  return requestUrl.protocol === 'https:';
}

export function setConnectFlowCookie(
  response: NextResponse,
  state: ConnectFlowState,
  isSecureContext: boolean,
): void {
  response.cookies.set(connectFlowCookieName(isSecureContext), JSON.stringify(state), {
    httpOnly: true,
    secure: isSecureContext,
    sameSite: 'lax',
    path: '/',
    maxAge: CONNECT_FLOW_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearConnectFlowCookie(response: NextResponse, isSecureContext: boolean): void {
  response.cookies.set(connectFlowCookieName(isSecureContext), '', {
    httpOnly: true,
    secure: isSecureContext,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function parseConnectFlowCookie(rawValue: string | undefined): ConnectFlowState | null {
  if (!rawValue) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawValue);
  } catch {
    return null;
  }

  const parsed = connectFlowStateSchema.safeParse(parsedJson);
  return parsed.success ? parsed.data : null;
}

/**
 * cookie の locale をそのまま path に連結すると `//evil.example` の protocol-relative
 * redirect になるので、必ず既知の locale だけを通す。
 */
export function normalizeLocale(candidate: string | undefined): string {
  const locales: readonly string[] = routing.locales;
  return candidate && locales.includes(candidate) ? candidate : routing.defaultLocale;
}
