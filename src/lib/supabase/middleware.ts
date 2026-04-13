/**
 * Supabase Middleware Client
 *
 * Middleware用のSupabaseクライアント - セッショントークンリフレッシュ処理
 *
 * @see https://supabase.com/docs/guides/auth/server-side/creating-a-client
 * @see Issue #531 - Supabase × Vercel × Next.js 認証チェックリスト
 *
 * 使用箇所:
 * - middleware.ts でのセッショントークンリフレッシュ
 *
 * 使用例:
 * ```tsx
 * // middleware.ts
 * import { updateSession } from '@/lib/supabase/middleware'
 *
 * export async function middleware(request: NextRequest) {
 *   const { response, supabase } = await updateSession(request)
 *
 *   // 認証チェック
 *   const { data: { user } } = await supabase.auth.getUser()
 *
 *   if (!user && isProtectedPath(request.nextUrl.pathname)) {
 *     return NextResponse.redirect(new URL('/auth/login', request.url))
 *   }
 *
 *   return response
 * }
 * ```
 *
 * 重要な役割:
 * 1. 期限切れトークンの自動リフレッシュ
 * 2. リフレッシュされたトークンをCookieに保存
 * 3. Server Components での重複リフレッシュを防止
 *
 * なぜMiddlewareでリフレッシュが必要か:
 * - Server Components は Cookie を書き込めない
 * - Middleware は全リクエストで実行されるため、
 *   トークンリフレッシュを一元管理できる
 * - CDN キャッシュとの競合を回避できる
 *
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 */

import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import type { Database } from '@/lib/database.types';

/**
 * Middlewareでセッションを更新（トークンリフレッシュ）
 *
 * この関数は以下を行います:
 * 1. リクエストから既存のセッションを読み込み
 * 2. 期限切れの場合、リフレッシュトークンで新しいアクセストークンを取得
 * 3. 更新されたトークンをレスポンスのCookieに書き込み
 * 4. Supabaseクライアントと更新されたレスポンスを返す
 *
 * @param request - Next.js Request オブジェクト
 * @returns { response, supabase } - 更新されたレスポンスとSupabaseクライアント
 */
export async function updateSession(request: NextRequest) {
  // レスポンスオブジェクトを作成（後でCookieを書き込む）
  let response = NextResponse.next({
    request,
  });

  // Supabaseクライアントを作成
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // リクエストにCookieを設定（後続の処理で使用）
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          // レスポンスを再作成してCookieを含める
          response = NextResponse.next({
            request,
          });

          // レスポンスにCookieを設定（ブラウザに送信）
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // ⚠️ 重要: getUser() を呼び出すことで、期限切れトークンが自動リフレッシュされる
  // この呼び出しにより、上記の setAll() が実行され、新しいトークンがCookieに保存される
  // パフォーマンス最適化: ユーザー情報も返すことで、呼び出し元での重複取得を防止
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, supabase, user };
}
