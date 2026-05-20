/**
 * 認証API エンドポイント
 * @description Supabase 認証の管理（Route Handler）
 *
 * レート制限:
 * - POST（signin/signup/reset）: 10回/分
 * - GET（session/user）: 制限なし
 *
 * @see Issue #531 - Supabase × Vercel × Next.js 認証チェックリスト
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAppUrl } from '@/lib/app-url';
import { logger } from '@/lib/logger';
import {
  loginRateLimit,
  passwordResetRateLimit,
  withUpstashRateLimit,
} from '@/lib/rate-limit/upstash';
import { createClient } from '@/lib/supabase/server';

const authPostSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('signin'),
    email: z.string().email().max(320),
    password: z.string().min(1).max(256),
  }),
  z.object({
    action: z.literal('signup'),
    email: z.string().email().max(320),
    password: z.string().min(8).max(256),
    turnstileToken: z.string().max(4096).optional(),
  }),
  z.object({
    action: z.literal('reset-password'),
    email: z.string().email().max(320),
  }),
  z.object({
    action: z.literal('signout'),
  }),
]);

/**
 * レート制限チェック用ヘルパー
 */
async function checkRateLimit(request: NextRequest, rateLimit: typeof loginRateLimit) {
  const result = await withUpstashRateLimit(request, rateLimit);

  if (result && !result.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': result.limit.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.reset.toString(),
          'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString(),
        },
      },
    );
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'session':
        // getUser()でJWT署名を検証してからセッション取得
        const { data: sessionUserData, error: sessionUserError } = await supabase.auth.getUser();
        if (sessionUserError || !sessionUserData.user) {
          return NextResponse.json({ session: null });
        }
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return NextResponse.json({ session: data.session });

      case 'user':
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        return NextResponse.json({ user: userData.user });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Auth GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = authPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const validated = parsed.data;

    // アクション別のレート制限適用
    let rateLimitResponse: NextResponse | null = null;

    switch (validated.action) {
      case 'signin':
      case 'signup':
        // ログイン/サインアップ: 5回/15分（厳格）
        rateLimitResponse = await checkRateLimit(request, loginRateLimit);
        if (rateLimitResponse) return rateLimitResponse;
        break;

      case 'reset-password':
        // パスワードリセット: 3回/1時間（より厳格）
        rateLimitResponse = await checkRateLimit(request, passwordResetRateLimit);
        if (rateLimitResponse) return rateLimitResponse;
        break;

      case 'signout':
        // サインアウトはレート制限なし（DoS対象外）
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const supabase = await createClient();

    switch (validated.action) {
      case 'signin': {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: validated.email,
          password: validated.password,
        });
        if (signInError) throw signInError;
        return NextResponse.json({ user: signInData.user, session: signInData.session });
      }

      case 'signup': {
        // Cloudflare Turnstile の検証は Supabase Auth (Bot Protection) が
        // captchaToken を受け取って内部で実行する。
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: validated.email,
          password: validated.password,
          ...(validated.turnstileToken && {
            options: { captchaToken: validated.turnstileToken },
          }),
        });
        if (signUpError) throw signUpError;
        return NextResponse.json({ user: signUpData.user, session: signUpData.session });
      }

      case 'signout': {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
        return NextResponse.json({ success: true });
      }

      case 'reset-password': {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(validated.email, {
          redirectTo: `${getAppUrl()}/auth/reset-password`,
        });
        if (resetError) throw resetError;
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Auth POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
