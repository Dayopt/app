/**
 * Auth Callback Route Handler
 *
 * OAuth認証とメール確認後のコールバック処理
 *
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 * @see Issue #531 - Supabase × Vercel × Next.js 認証チェックリスト
 *
 * フロー:
 * 1. ユーザーがOAuth（Google/Apple）でサインイン
 * 2. SupabaseがこのエンドポイントにリダイレクトしてAuthCodeを送信
 * 3. AuthCodeをアクセストークンに交換
 * 4. セッションを確立してダッシュボードへリダイレクト
 */

import { NextResponse } from 'next/server';

import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = getSafeRedirectPath(requestUrl.searchParams.get('next'));

  if (code) {
    const supabase = await createClient();

    // AuthCodeをセッションに交換
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // 成功した場合は元のページまたはデフォルトページへリダイレクト
      return NextResponse.redirect(new URL(next, request.url));
    }

    // エラーが発生した場合はログインページへリダイレクト
    return NextResponse.redirect(new URL('/auth/login?error=auth_callback_error', request.url));
  }

  // コードがない場合はログインページへリダイレクト
  return NextResponse.redirect(new URL('/auth/login', request.url));
}
