/**
 * Supabase セッション継続性ヘルパー（#2516）
 *
 * `@supabase/ssr` は Cookie refresh 時、`setAll(cookiesToSet, headers)` の第2引数として
 * `Cache-Control` / `Expires` / `Pragma` を渡す。この headers を無視したまま CDN が
 * `Set-Cookie` 付きレスポンスをキャッシュすると、別ユーザーへセッションが配信され得る
 * （Supabase 公式が明示的に警告している経路）。
 *
 * `middleware.ts` の `updateSession()` は Cookie は書くが headers を捨てていた。加えて
 * `proxy.ts` は `updateSession()` の後、未認証 redirect / auth path redirect / MFA
 * redirect / エラー時 redirect で新しい `NextResponse` を都度生成しており、その経路では
 * refresh Cookie 自体も引き継がれていなかった。
 *
 * このモジュールは refresh で得た Cookie / headers を「持ち回り」構造として保持し、
 * 呼び出し側が新しく作った任意の `NextResponse` へ後から写せるようにする。
 *
 * `middleware.ts` から分離しているのは、`proxy.test.ts` が
 * `vi.mock('@/lib/supabase/middleware', () => ({ updateSession: mocks.updateSession }))`
 * で `updateSession` 自体を丸ごとモックしているため。`applySessionContinuity` を
 * `middleware.ts` に置くと、そのモックの下では未定義になり proxy 側のテストが実際の
 * コピーロジックを検証できなくなる。
 */

import type { CookieOptions } from '@supabase/ssr';
import type { NextResponse } from 'next/server';

export interface SessionCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

/** setAll() が渡した refresh Cookie と no-cache 系 headers の持ち回り。 */
export interface SessionContinuity {
  cookies: SessionCookie[];
  headers: Record<string, string>;
}

export function createEmptySessionContinuity(): SessionContinuity {
  return { cookies: [], headers: {} };
}

/**
 * `continuity` の Cookie / headers を `target` へ写し、`target` をそのまま返す。
 *
 * 呼び出し側は `return applySessionContinuity(NextResponse.redirect(url), continuity)`
 * のように、新しく作ったレスポンスへそのまま重ねられる。
 */
export function applySessionContinuity<T extends NextResponse>(
  target: T,
  continuity: SessionContinuity,
): T {
  for (const { name, value, options } of continuity.cookies) {
    target.cookies.set(name, value, options);
  }
  for (const [key, value] of Object.entries(continuity.headers)) {
    target.headers.set(key, value);
  }
  return target;
}
