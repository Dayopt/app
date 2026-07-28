import { isProSubscriptionStatus } from '@dayopt/billing';

const protectedProductPaths = [
  '/tasks',
  '/settings',
  '/box',
  '/table',
  '/board',
  '/add',
  '/tags',
  '/oauth/authorize',
  '/oauth/consent',
] as const;

// workspace の時間軸ビュー（/day, /week, /2day〜/9day）。calendar namespace 廃止後も認証必須。
// prefix では /2day が /day に当たらないため、パス形状を正規表現で判定する。
const workspaceViewPathPattern = /^\/(day|week|\d+day)(\/|$)/;

const authProductPaths = ['/login', '/signup', '/auth'] as const;

/**
 * 認証済みでもアクセスを許す auth path。
 *
 * 通常の auth path（ログイン・サインアップ）は認証済みなら /week へ流すが、
 * 以下はセッションを持ったまま踏むのが正常系なので除外する:
 * - `/auth/mfa-verify`: aal1 セッションから aal2 へ昇格させる
 * - `/auth/confirm`: メール内リンクの token_hash を verifyOtp する。ログイン中の
 *   メールアドレス変更はここを必ず通る
 * - `/auth/callback`: OAuth の code 交換
 * - `/auth/reset-password`: confirm の verifyOtp でセッション確立後に着地する
 */
const authPathsAllowedWhileAuthenticated = [
  '/auth/mfa-verify',
  '/auth/confirm',
  '/auth/callback',
  '/auth/reset-password',
] as const;

const publicProductPaths = ['/', '/about', '/privacy', '/terms', '/contact', '/pricing'] as const;

const publicRewritePaths = ['/mcp', '/oauth/token'] as const;

export function canAccessProFeatures(status: string | null | undefined): boolean {
  return isProSubscriptionStatus(status);
}

export function isProtectedProductPath(pathname: string): boolean {
  return (
    matchesPathPrefix(pathname, protectedProductPaths) || workspaceViewPathPattern.test(pathname)
  );
}

export function isAuthProductPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, authProductPaths);
}

/** 認証済みユーザーを /week へ流してはいけない auth path かどうか */
export function isAuthPathAllowedWhileAuthenticated(pathname: string): boolean {
  return matchesExactPath(pathname, authPathsAllowedWhileAuthenticated);
}

export function isPublicProductPath(pathname: string): boolean {
  return matchesExactPath(pathname, publicProductPaths);
}

export function isPublicRewritePath(pathname: string): boolean {
  return matchesExactPath(pathname, publicRewritePaths);
}

function matchesPathPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((path) => pathname.startsWith(path));
}

function matchesExactPath(pathname: string, paths: readonly string[]): boolean {
  return paths.some((path) => pathname === path);
}
