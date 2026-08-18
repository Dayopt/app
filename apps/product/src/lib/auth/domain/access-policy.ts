import { isProSubscriptionStatus } from '@dayopt/billing';

const protectedProductPaths = [
  '/calendar',
  '/report',
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

// workspace の時間軸ビュー旧URL（/day, /week, /2day〜/9day）。/calendar への統一後も
// workspace-shell-restructure Step 6（旧route削除）までは残す — 削除条件は「旧route
// ファイルを削除した Step と同じ PR」（docs/projects/workspace-shell-restructure/
// overview.md §4-5-b）。残すコストはゼロで、消し忘れより消し急ぎの方が危ない。
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
 * - `/auth/session-error`: MFA AAL lookup 失敗時の着地ページ（#2144）。認証済みで
 *   弾くと `/week` との無限 redirect ループになる（proxy.ts の lookupFailed 分岐参照）
 */
const authPathsAllowedWhileAuthenticated = [
  '/auth/mfa-verify',
  '/auth/confirm',
  // メール確認の結果ページ（#1956）。確認リンクはログイン中の browser でも開かれるため、
  // 認証済みで弾くと「確認できたのか分からないまま /week へ飛ぶ」無言バウンスになる。
  '/auth/confirmed',
  '/auth/callback',
  '/auth/reset-password',
  '/auth/session-error',
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
