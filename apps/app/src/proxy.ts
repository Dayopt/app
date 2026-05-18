import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { routing } from '@/lib/i18n/routing';
import { logger } from '@/lib/logger';
import { updateSession } from '@/lib/supabase/middleware';

// next-intlのミドルウェアを作成
const intlMiddleware = createMiddleware(routing);

// 認証が必要なパス
const protectedPaths = [
  '/tasks',
  '/settings',
  '/calendar',
  '/review',

  '/box',
  '/table',
  '/board',
  '/add',
  '/tags',
  '/oauth/authorize',
  '/oauth/consent',
];

// 認証ページのパス
const authPaths = ['/login', '/signup', '/auth'];

// 公開パス（認証チェック不要）- getUser() 呼び出しをスキップしてパフォーマンス向上
const publicPaths = ['/', '/about', '/privacy', '/terms', '/contact', '/pricing'];

// Vercel rewritesでAPI routeへ到達させる公開パス
const publicRewritePaths = ['/mcp', '/oauth/token'];
const MCP_HOST = 'mcp.dayopt.app';

// 言語プレフィックスを除いたパスを取得
// as-needed設定: デフォルト言語(en)はプレフィックスなし
function getPathWithoutLocale(pathname: string): string {
  // 非デフォルトロケール(ja)のみプレフィックスあり
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue; // デフォルトはスキップ
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1);
    }
    if (pathname === `/${locale}`) {
      return '/';
    }
  }
  // デフォルト言語またはプレフィックスなしの場合はそのまま返す
  return pathname;
}

// 現在の言語を取得
// as-needed設定: プレフィックスなし = デフォルト言語(en)
function getCurrentLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue; // デフォルトはスキップ
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
      return locale;
    }
  }
  return routing.defaultLocale;
}

// ロケールプレフィックス付きパスを生成
// as-needed設定: デフォルト言語(en)はプレフィックスなし
function getLocalizedPath(path: string, locale: string): string {
  if (locale === routing.defaultLocale) {
    // デフォルト言語はプレフィックスなし
    return path;
  }
  // 非デフォルト言語はプレフィックス付き
  return `/${locale}${path}`;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hostname = request.nextUrl.hostname;

  // 静的ファイル、API、_nextファイルはスキップ
  // API routes は middleware 認証をスキップ — 各ルートが自前で認証:
  // - /api/auth: レート制限 + Zod検証
  // - /api/trpc: protectedProcedure で ctx.userId チェック
  // - /api/chat: 内部認証チェック
  // - /api/webhooks: Stripe/Resend署名検証
  // ⚠️ 新規APIルートは必ず自前の認証を実装すること
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') ||
    (hostname === MCP_HOST && pathname === '/') ||
    publicRewritePaths.includes(pathname)
  ) {
    return NextResponse.next();
  }

  // メンテナンス / オフラインページは言語処理をスキップ
  if (pathname === '/maintenance' || pathname === '/offline') {
    return NextResponse.next();
  }

  // 言語プレフィックス付きメンテナンスページへのアクセスをリダイレクト
  for (const locale of routing.locales) {
    if (pathname === `/${locale}/maintenance`) {
      return NextResponse.redirect(new URL('/maintenance', request.url));
    }
  }

  // `user-tz` Cookie からタイムゾーンを読み取り、リクエストヘッダーとして転送
  // → Server Components / prefetch 関数で `headers().get('x-user-timezone')` で利用可能にする
  const userTz = request.cookies.get('user-tz')?.value;
  if (userTz) {
    request.headers.set('x-user-timezone', userTz);
  }

  // メンテナンスモードチェック
  const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';
  if (isMaintenanceMode) {
    return NextResponse.redirect(new URL('/maintenance', request.url));
  }

  // next-intlのミドルウェアを実行（言語検出とリダイレクト）
  const intlResponse = intlMiddleware(request);

  // リダイレクトレスポンスの場合はそのまま返す
  if (intlResponse.status !== 200) {
    return intlResponse;
  }

  const currentLocale = getCurrentLocale(pathname);
  const pathWithoutLocale = getPathWithoutLocale(pathname);

  const isProtectedPath = protectedPaths.some((path) => pathWithoutLocale.startsWith(path));
  const isAuthPath = authPaths.some((path) => pathWithoutLocale.startsWith(path));
  const isPublicPath = publicPaths.some((path) => pathWithoutLocale === path);

  // パフォーマンス最適化: 公開ページでは getUser() をスキップ
  // getUser() は Supabase API への往復が発生するため、認証が必要なパスのみ実行
  if (isPublicPath && !isProtectedPath && !isAuthPath) {
    return intlResponse;
  }

  // Supabaseセッションを更新（ユーザー情報も同時取得 - 重複呼び出し防止で高速化）
  const { response, supabase, user } = await updateSession(request);

  try {
    // 環境変数で認証をスキップ（開発環境用）
    const skipAuth =
      process.env.SKIP_AUTH_IN_DEV === 'true' && process.env.NODE_ENV === 'development';

    if (skipAuth) {
      // next-intlのヘッダーをコピー
      intlResponse.headers.forEach((value, key) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // 未認証でprotectedPathにアクセスした場合
    if (!user && isProtectedPath) {
      const loginUrl = new URL(getLocalizedPath('/auth/login', currentLocale), request.url);
      // OAuth flow 等で query string が必要なため search も含めて redirect 先に保持する
      const search = request.nextUrl.search;
      loginUrl.searchParams.set('redirect', pathWithoutLocale + search);
      return NextResponse.redirect(loginUrl);
    }

    // 認証済みでauth系のパスにアクセスした場合
    // MFA検証ページは除外
    const isMFAVerifyPath = pathWithoutLocale === '/auth/mfa-verify';

    if (user && isAuthPath && !isMFAVerifyPath) {
      return NextResponse.redirect(
        new URL(getLocalizedPath('/calendar/day', currentLocale), request.url),
      );
    }

    // MFA AAL強制（認証済みユーザーのみ）
    if (user && isProtectedPath && !isMFAVerifyPath) {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2') {
        // MFA有効だがまだ検証していない → mfa-verifyへ強制リダイレクト
        return NextResponse.redirect(
          new URL(getLocalizedPath('/auth/mfa-verify', currentLocale), request.url),
        );
      }
    }

    // next-intlのヘッダーをコピー
    intlResponse.headers.forEach((value, key) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    logger.error('Proxy error:', error);
    return NextResponse.redirect(
      new URL(getLocalizedPath('/auth/login', currentLocale), request.url),
    );
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|robots.txt|sitemap.xml).*)',
  ],
};
