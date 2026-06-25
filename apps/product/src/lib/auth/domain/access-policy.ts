import { isProSubscriptionStatus } from '@dayopt/billing';

const protectedProductPaths = [
  '/tasks',
  '/settings',
  '/review',
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
