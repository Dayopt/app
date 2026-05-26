import { isProSubscriptionStatus } from '@dayopt/billing';

import { isAdminRole, type ProductRole } from './roles';

export const protectedProductPaths = [
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
] as const;

export const authProductPaths = ['/login', '/signup', '/auth'] as const;

export const publicProductPaths = [
  '/',
  '/about',
  '/privacy',
  '/terms',
  '/contact',
  '/pricing',
] as const;

export const publicRewritePaths = ['/mcp', '/oauth/token'] as const;

export function canAccessProFeatures(status: string | null | undefined): boolean {
  return isProSubscriptionStatus(status);
}

export function canAccessAdminFeatures(role: ProductRole | null | undefined): boolean {
  return isAdminRole(role);
}

export function isProtectedProductPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, protectedProductPaths);
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
