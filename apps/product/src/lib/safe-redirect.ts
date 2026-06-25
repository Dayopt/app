/**
 * オープンリダイレクト防止ユーティリティ
 *
 * 認証コールバック等で使用する `next` パラメータを検証し、
 * 外部サイトへのリダイレクトを防止する。
 *
 * @see OWASP - Unvalidated Redirects and Forwards
 */

/**
 * リダイレクト先パスを検証し、安全な相対パスのみ許可する。
 *
 * 拒否されるパターン:
 * - 絶対URL (`https://evil.com`)
 * - プロトコル相対URL (`//evil.com`)
 * - エンコードされたバイパス (`%2F%2Fevil.com`)
 */
export function getSafeRedirectPath(next: string | null, fallback = '/week'): string {
  if (!next) return fallback;

  // 相対パスでない、またはプロトコル相対URL
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;

  // エンコードされたバイパスを検出
  try {
    const decoded = decodeURIComponent(next);
    if (decoded.startsWith('//') || decoded.includes('://')) return fallback;
  } catch {
    return fallback;
  }

  return next;
}
