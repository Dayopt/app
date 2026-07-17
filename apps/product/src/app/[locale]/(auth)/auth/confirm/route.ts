/**
 * Email Confirmation Route Handler
 *
 * メールアドレス確認のコールバック処理
 *
 * フロー:
 * 1. ユーザーが確認メール内のリンクをクリック
 * 2. Supabaseがこのエンドポイントにリダイレクト（token_hash + type を付与）
 * 3. OTPトークンを検証してメールアドレスを確認
 * 4. 成功時はダッシュボードへリダイレクト
 */

import type { EmailOtpType } from '@supabase/auth-js';
import { type NextRequest, NextResponse } from 'next/server';

import { getSafeRedirectPath } from '@/lib/safe-redirect';
import { observeAuthOperation } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = getSafeRedirectPath(searchParams.get('next'));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await observeAuthOperation('verify_email_otp', () =>
      supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      }),
    );

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // トークンが無効または不足 → ログインページへ
  return NextResponse.redirect(new URL('/auth/login?error=confirmation_failed', request.url));
}
