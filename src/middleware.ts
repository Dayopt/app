/**
 * Next.js Middleware
 *
 * 役割:
 * 1. Supabase セッショントークンリフレッシュ
 * 2. `user-tz` Cookie からタイムゾーンを読み取り、`x-user-timezone` リクエストヘッダーとして転送
 *    → Server Components / prefetch 関数で正しいタイムゾーンを利用可能にする
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { updateSession } from '@/platform/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { response } = await updateSession(request);

  // `user-tz` Cookie に保存されたタイムゾーンをリクエストヘッダーに転送
  // 初回アクセス時はCookieが存在しないため、ヘッダーは付与しない（UTCフォールバック）
  const userTz = request.cookies.get('user-tz')?.value;
  if (userTz) {
    // レスポンスを再生成してヘッダーを追加
    const nextResponse = NextResponse.next({
      request: {
        headers: new Headers({
          ...Object.fromEntries(request.headers.entries()),
          'x-user-timezone': userTz,
        }),
      },
    });

    // Supabase middleware が書き込んだ Cookie をコピー
    response.cookies.getAll().forEach(({ name, value }) => {
      nextResponse.cookies.set(name, value);
    });

    return nextResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 以下を除くすべてのパスにマッチ:
     * - _next/static（静的ファイル）
     * - _next/image（画像最適化）
     * - favicon.ico, sitemap.xml, robots.txt
     * - 静的アセット（画像・フォント等）
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
};
